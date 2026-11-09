import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  markerName,
  plan,
  playgroundName,
  readme,
  type Item,
  type Platform,
} from './filesPlan.mts';

const flags = new Set(
  process.argv.slice(2).filter((arg) => arg.startsWith('--')),
);
const [given] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const folder = path.resolve(
  given ?? path.join(import.meta.dirname, '..', '..', '..', '..'),
);
const root = path.join(folder, playgroundName);
const marker = path.join(root, markerName);
const platform: Platform =
  process.platform === 'win32' || process.platform === 'darwin'
    ? process.platform
    : 'linux';
const windows = platform === 'win32';
const large = flags.has('--large');
const churning = flags.has('--churn');
const everyone = '*S-1-1-0';

interface Made {
  readonly madeBy: string;
  readonly locked: readonly string[];
  readonly readOnly: readonly string[];
  readonly skipped: readonly string[];
}

const at = (where: string) => path.join(root, ...where.split('/'));

const quietly = (command: string, args: readonly string[], cwd?: string) =>
  execFileSync(command, args, {
    cwd,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Playground',
      GIT_AUTHOR_EMAIL: 'playground@example.com',
      GIT_COMMITTER_NAME: 'Playground',
      GIT_COMMITTER_EMAIL: 'playground@example.com',
      GIT_AUTHOR_DATE: '2026-02-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2026-02-01T00:00:00Z',
    },
  });

const madeBefore = (): Made | undefined => {
  try {
    const made: Made = JSON.parse(fs.readFileSync(marker, 'utf8'));
    return made;
  } catch {
    return undefined;
  }
};

const unlock = ({ locked, readOnly }: Made) => {
  for (const where of locked) {
    try {
      if (windows) {
        quietly('icacls', [at(where), '/remove:d', everyone]);
      } else {
        fs.chmodSync(at(where), 0o755);
      }
    } catch {
      continue;
    }
  }
  for (const where of readOnly) {
    try {
      fs.chmodSync(at(where), 0o666);
    } catch {
      continue;
    }
  }
};

const record = (made: Made) =>
  fs.writeFileSync(marker, `${JSON.stringify(made, null, 2)}\n`);

const placed = (where: string) => {
  const full = at(where);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  return full;
};

function makeSparse(full: string, size: number): boolean {
  fs.writeFileSync(full, '');
  if (windows) {
    try {
      quietly('fsutil', ['sparse', 'setflag', full]);
    } catch {
      fs.rmSync(full);
      return false;
    }
  }
  const handle = fs.openSync(full, 'r+');
  fs.writeSync(handle, Buffer.from('end'), 0, 3, size - 3);
  fs.closeSync(handle);
  return true;
}

function writeChunks(
  full: string,
  chunks: Iterable<string | Buffer>,
  size?: number,
) {
  const handle = fs.openSync(full, 'w');
  let written = 0;
  for (const chunk of chunks) {
    const bytes = Buffer.from(chunk);
    fs.writeSync(handle, bytes);
    written += bytes.length;
  }
  fs.closeSync(handle);
  if (size !== undefined && written !== size) {
    throw new Error(`${full} came to ${written} bytes, not ${size}.`);
  }
}

function make() {
  const made = plan({ platform, large });
  const { items } = made;
  const ofKind = <K extends Item['kind']>(kind: K) =>
    items.filter(
      (item): item is Extract<Item, { kind: K }> => item.kind === kind,
    );
  const locked = ofKind('folder')
    .filter(({ unreadable }) => unreadable === true)
    .map((item) => item.path);
  const readOnly = ofKind('file')
    .filter((item) => item.readOnly === true)
    .map((item) => item.path);
  const skipped: string[] = [];
  const skip = (reason: string) => {
    if (!skipped.includes(reason)) {
      skipped.push(reason);
    }
  };
  fs.mkdirSync(root, { recursive: true });
  record({ madeBy: 'npm run playground:files', locked, readOnly, skipped });

  for (const item of ofKind('folder')) {
    fs.mkdirSync(at(item.path), { recursive: true });
  }
  for (const item of items) {
    switch (item.kind) {
      case 'file': {
        const full = placed(item.path);
        fs.writeFileSync(full, item.content());
        if (item.mode !== undefined && !windows) {
          fs.chmodSync(full, item.mode);
        }
        break;
      }
      case 'chunks':
        writeChunks(placed(item.path), item.chunks(), item.size);
        break;
      case 'sparse':
        if (!makeSparse(placed(item.path), item.size)) {
          skip(
            `${item.path}: the drive can't store a sparse file, which would take ${item.size.toLocaleString('en-US')} bytes of it`,
          );
        }
        break;
      case 'copy':
        try {
          fs.copyFileSync(item.from, placed(item.path));
        } catch {
          skip(`${item.path}: ${item.from} isn't there to copy`);
        }
        break;
      default:
        break;
    }
  }
  for (const item of ofKind('link')) {
    try {
      fs.symlinkSync(
        item.target,
        placed(item.path),
        item.folder ? 'dir' : 'file',
      );
    } catch (error) {
      const refused =
        error instanceof Error && 'code' in error && error.code === 'EPERM';
      if (!windows || !refused) {
        throw error;
      }
      skip(
        'links: Windows makes symbolic links only in Developer Mode or for an administrator',
      );
    }
  }
  for (const item of ofKind('junction')) {
    const full = placed(item.path);
    fs.symlinkSync(
      path.resolve(path.dirname(full), item.target),
      full,
      'junction',
    );
  }
  for (const item of ofKind('repository')) {
    const cwd = at(item.path);
    quietly('git', ['init', '--quiet', '--initial-branch=main'], cwd);
    quietly('git', ['add', '--all'], cwd);
    quietly(
      'git',
      [
        'commit',
        '--quiet',
        '--message',
        'Start a repository inside the playground',
      ],
      cwd,
    );
  }
  for (const item of ofKind('file')) {
    const full = at(item.path);
    if (item.modified !== undefined) {
      fs.utimesSync(full, item.modified, item.modified);
    }
    if (windows && (item.hidden === true || item.system === true)) {
      quietly('attrib', [
        ...(item.hidden === true ? ['+h'] : []),
        ...(item.system === true ? ['+s'] : []),
        full,
      ]);
    }
    if (platform === 'darwin' && item.flaggedHidden === true) {
      quietly('chflags', ['hidden', full]);
    }
    if (item.readOnly === true) {
      fs.chmodSync(full, 0o444);
    }
  }
  fs.writeFileSync(at('README.md'), readme(made, skipped));
  const folders = ofKind('folder').toSorted(
    (a, b) => b.path.split('/').length - a.path.split('/').length,
  );
  for (const item of folders) {
    const full = at(item.path);
    if (windows && item.hidden === true) {
      quietly('attrib', ['+h', full]);
    }
    if (item.modified !== undefined) {
      fs.utimesSync(full, item.modified, item.modified);
    }
  }
  for (const where of locked) {
    if (windows) {
      quietly('icacls', [at(where), '/deny', `${everyone}:(OI)(CI)(RD)`]);
    } else {
      fs.chmodSync(at(where), 0);
    }
  }
  record({ madeBy: 'npm run playground:files', locked, readOnly, skipped });
  console.log(
    `Made ${root}${large ? ', with the huge files' : ''}.${skipped.length === 0 ? '' : ` Left out: ${skipped.join('; ')}.`}`,
  );
}

function churn() {
  const churned = at('churn');
  fs.mkdirSync(churned, { recursive: true });
  const named = (tick: number) =>
    path.join(churned, `added-${String(tick).padStart(5, '0')}.txt`);
  let tick = 0;
  console.log(`Changing ${churned} every half second. Stop with Ctrl+C.`);
  setInterval(() => {
    tick++;
    fs.writeFileSync(named(tick), `Added at tick ${tick}.\n`);
    fs.appendFileSync(path.join(churned, 'growing.log'), `tick ${tick}\n`);
    fs.rmSync(named(tick - 20), { force: true });
    const [from, to] =
      tick % 2 === 0
        ? ['renamed-back.txt', 'renamed.txt']
        : ['renamed.txt', 'renamed-back.txt'];
    if (fs.existsSync(path.join(churned, from))) {
      fs.renameSync(path.join(churned, from), path.join(churned, to));
    } else {
      fs.writeFileSync(path.join(churned, to), 'Renamed back and forth.\n');
    }
  }, 500);
}

const before = fs.existsSync(root) ? madeBefore() : undefined;
if (fs.existsSync(root) && before === undefined) {
  console.error(
    `${root} wasn't made by this script, so it is left alone. Move it away to make the playground.`,
  );
  process.exit(1);
}
if (!churning || before === undefined) {
  if (before !== undefined) {
    unlock(before);
    fs.rmSync(root, { recursive: true, force: true });
  }
  make();
}
if (churning) {
  churn();
}
