import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  isSaved,
  resultSuffix,
  type SavedResult,
} from '../src/test/perf/perfTrace.ts';
import {
  parseRunArgs,
  runOrder,
  summaryTable,
  variantName,
  type Ran,
} from './perfRuns.mts';

const app = path.resolve(import.meta.dirname, '..');
const builds = path.join(app, 'perf-build');
const current = 'current';
const sevenZip = path.join(
  'build',
  '7zip',
  `${process.platform}-${process.arch}`,
);

function run(
  command: string,
  args: readonly string[],
  options: SpawnSyncOptions = {},
): void {
  const ran = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (ran.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
}

function git(args: readonly string[], env: NodeJS.ProcessEnv = {}): string {
  const ran = spawnSync('git', args, {
    cwd: app,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    env: { ...process.env, ...env },
  });
  if (ran.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${ran.stderr}`);
  }
  return ran.stdout;
}

function copyWorkingTree(into: string): void {
  for (const file of git([
    'ls-files',
    '-co',
    '--exclude-standard',
    '-z',
    '--',
    '.',
  ])
    .split('\0')
    .filter((name) => name !== '')) {
    const from = path.join(app, file);
    if (fs.existsSync(from)) {
      fs.mkdirSync(path.dirname(path.join(into, file)), { recursive: true });
      fs.copyFileSync(from, path.join(into, file));
    }
  }
}

function checkOut(ref: string, into: string): void {
  const index = path.join(os.tmpdir(), `fastforward-perf-index-${process.pid}`);
  const prefix = git(['rev-parse', '--show-prefix']).trim();
  const top = git(['rev-parse', '--show-toplevel']).trim();
  try {
    git(['read-tree', `${ref}:${prefix}`], { GIT_INDEX_FILE: index });
    const relative = path.relative(top, into).split(path.sep).join('/');
    git(['-C', top, 'checkout-index', '-a', `--prefix=${relative}/`], {
      GIT_INDEX_FILE: index,
    });
  } finally {
    fs.rmSync(index, { force: true });
  }
}

function build(name: string, ref: string | undefined): void {
  const into = path.join(builds, name);
  fs.rmSync(into, { recursive: true, force: true });
  fs.mkdirSync(into, { recursive: true });
  if (ref === undefined) {
    copyWorkingTree(into);
  } else {
    checkOut(ref, into);
  }
  if (fs.existsSync(path.join(app, sevenZip))) {
    fs.cpSync(path.join(app, sevenZip), path.join(into, sevenZip), {
      recursive: true,
    });
  }
  console.log(
    `Building ${ref ?? 'the working tree'} for production into ${into}.`,
  );
  const modules = path.join(into, 'node_modules');
  fs.symlinkSync(path.join(app, 'node_modules'), modules, 'junction');
  try {
    run(process.execPath, ['scripts/esbuild.mts', '--production'], {
      cwd: into,
      stdio: ['ignore', 'ignore', 'inherit'],
    });
  } finally {
    fs.unlinkSync(modules);
  }
  if (!fs.existsSync(path.join(app, 'node_modules', 'esbuild'))) {
    throw new Error('The packages of the app went missing with the build');
  }
}

function saved(folder: string): SavedResult[] {
  return fs.existsSync(folder)
    ? fs
        .readdirSync(folder)
        .filter((file) => file.endsWith(resultSuffix))
        .flatMap((file) => {
          const read: unknown = JSON.parse(
            fs.readFileSync(path.join(folder, file), 'utf8'),
          );
          return isSaved(read) ? [read] : [];
        })
    : [];
}

function described(name: string, ref: string | undefined): string {
  if (ref !== undefined) {
    return `${name}: ${ref} at ${git(['rev-parse', '--short', ref]).trim()}`;
  }
  const changed = git(['status', '--porcelain', '--', '.']).trim() !== '';
  return `${name}: the working tree at ${git(['rev-parse', '--short', 'HEAD']).trim()}${changed ? ' with its changes' : ''}`;
}

const { runs, against, vitest } = parseRunArgs(process.argv.slice(2));
const base = against === undefined ? undefined : variantName(against);
const variants = base === undefined ? [current] : [base, current];
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const results = path.join(app, 'perf-results', stamp);
fs.mkdirSync(results, { recursive: true });

build(current, undefined);
if (base !== undefined && against !== undefined) {
  build(base, against);
}

const order = runOrder(variants, runs);
const ran: Ran[] = [];
const failed: string[] = [];
for (const [index, { variant, round }] of order.entries()) {
  const folder = path.join(results, `${variant}-${round}`);
  console.log(
    `Run ${index + 1} of ${order.length}: ${variant}, round ${round}.`,
  );
  const tested = spawnSync(
    process.execPath,
    [
      path.join(app, 'node_modules', 'vitest', 'vitest.mjs'),
      'run',
      '--project',
      'perf',
      ...vitest,
    ],
    {
      cwd: app,
      stdio: ['ignore', 'ignore', 'inherit'],
      env: {
        ...process.env,
        FASTFORWARD_PERF_BUILD: path.join('perf-build', variant),
        FASTFORWARD_PERF_RESULTS: folder,
      },
    },
  );
  if (tested.status !== 0) {
    failed.push(`${variant}, round ${round}`);
  }
  ran.push(...saved(folder).map(({ result }) => ({ variant, result })));
  if (round < runs) {
    for (const file of fs.readdirSync(folder)) {
      if (file.endsWith('.trace.json')) {
        fs.rmSync(path.join(folder, file));
      }
    }
  }
}

const hz = [...new Set(ran.map(({ result }) => result.hz))].join(', ');
const summary = [
  '# Frames',
  '',
  `- ${runs} run${runs === 1 ? '' : 's'} of each build, taking turns at going first, at ${hz || 'no'} Hz`,
  ...variants.map(
    (variant) =>
      `- ${described(variant, variant === current ? undefined : against)}`,
  ),
  ...(failed.length === 0
    ? []
    : [`- Runs with failed scenarios: ${failed.join('; ')}`]),
  `- Medians, with the range of the runs${variants.length > 1 ? `, and the change from ${variants[0]} to ${current}, clear when five runs or more of each build do not overlap, which chance does about one time in 126 for each figure, the builds alike` : ''}; the traces of the last round are in ${results}`,
  '',
  summaryTable(ran, variants),
].join('\n');
fs.writeFileSync(path.join(results, 'summary.md'), summary);
console.log(`\n${summary}`);
if (failed.length > 0) {
  process.exitCode = 1;
}
