import * as assert from 'node:assert';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { findGit } from '../git/locate';

// The code under test, and the app the tests start, run git with the tests'
// environment, so they leave out the user's config as tempRepository does
process.env.GIT_CONFIG_GLOBAL = '/dev/null';

export interface TempRepository {
  readonly root: string;
  readonly gitPath: string;
  git(...args: string[]): Promise<string>;
  commit(message: string, files?: Record<string, string>): Promise<void>;
  resolve(...revisions: string[]): Promise<string[]>;
}

// Repositories go in here rather than in another repository, where they would
// be untracked files for the view to diff on every refresh
export function tempFolder(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `fastforward-${name}-`));
}

const unremoved = new Set<string>();

function tryRemoving(folder: string, maxRetries = 5): unknown {
  try {
    fs.rmSync(folder, {
      recursive: true,
      force: true,
      maxRetries,
      retryDelay: 100,
    });
    return undefined;
  } catch (error) {
    return error;
  }
}

// On Windows a folder can't be removed while a process a test started still
// runs in it, such as a git a cancelled command stops on its own time; that
// is tried again once the file's tests are done, and fails the run then, as
// failing the teardown would skip the rest of its suite
export function removeFolder(folder: string): void {
  if (tryRemoving(folder) !== undefined) {
    unremoved.add(folder);
  }
}

export async function assertNoFoldersLeft(): Promise<void> {
  if (templateFolder !== undefined) {
    removeFolder(templateFolder);
    templateFolder = undefined;
    templates.clear();
  }
  const left = [...unremoved];
  unremoved.clear();
  assert.deepStrictEqual(
    await foldersLeft(left, Date.now() + 7000),
    [],
    'folders left behind',
  );
}

export async function foldersLeft(
  folders: readonly string[],
  until: number,
  remove = (folder: string) => tryRemoving(folder, 0),
): Promise<string[]> {
  const removing = (left: readonly string[]) =>
    left.flatMap((folder) => {
      const error = remove(folder);
      return error === undefined ? [] : [{ folder, error }];
    });
  let left = removing(folders);
  while (left.length > 0 && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    left = removing(left.map(({ folder }) => folder));
  }
  return left.map(({ folder, error }) =>
    error instanceof Error ? `${folder}: ${error.message}` : folder,
  );
}

// The system or global config can turn the ownership check off with
// safe.directory, as CI runners do for every folder
const ownedByAnother = {
  GIT_TEST_ASSUME_DIFFERENT_OWNER: '1',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
};

export function savedEnv(names: readonly string[]): () => void {
  const saved = names.map((name) => [name, process.env[name]] as const);
  return () => setEnv(Object.fromEntries(saved));
}

function setEnv(variables: Readonly<Record<string, string | undefined>>) {
  for (const [name, value] of Object.entries(variables)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

export async function withEnv(
  variables: Readonly<Record<string, string | undefined>>,
  run: () => Promise<void>,
): Promise<void> {
  const restore = savedEnv(Object.keys(variables));
  setEnv(variables);
  try {
    await run();
  } finally {
    restore();
  }
}

export function asIfOwnedByAnother(run: () => Promise<void>): Promise<void> {
  return withEnv(ownedByAnother, run);
}

export function symlinkOrSkip(
  context: Mocha.Context,
  target: string,
  link: string,
): void {
  try {
    fs.symlinkSync(target, link);
  } catch (error) {
    if (!(
      error instanceof Error &&
      'code' in error &&
      error.code === 'EPERM'
    )) {
      throw error;
    }
    context.skip();
  }
}

function runGit(cwd: string, date: Date, args: string[]): Promise<string> {
  const iso = date.toISOString();
  const env = {
    ...process.env,
    // Leaves out the user's config, which may sign commits or run hooks, but
    // not the system's, whose defaults the app reads too
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_DATE: iso,
    GIT_COMMITTER_DATE: iso,
  };
  return fixtureGit().then(
    (binary) =>
      new Promise((resolve, reject) => {
        execFile(
          binary,
          [
            '-c',
            'user.name=Test',
            '-c',
            'user.email=test@example.com',
            '-c',
            'maintenance.auto=false',
            ...args,
          ],
          { cwd, env },
          (error, stdout, stderr) => {
            if (error) {
              reject(new Error(`git ${args.join(' ')} failed: ${stderr}`));
            } else {
              resolve(stdout);
            }
          },
        );
      }),
  );
}

let templateFolder: string | undefined;
const templates = new Map<string, Promise<string>>();

// Copying a repository git initialized once is faster than running git init
// for each one
function template(branch: string, bare: boolean): Promise<string> {
  const key = JSON.stringify([branch, bare]);
  let made = templates.get(key);
  if (made === undefined) {
    templateFolder ??= tempFolder('templates');
    const folder = path.join(templateFolder, String(templates.size));
    fs.mkdirSync(folder);
    made = runGit(folder, new Date(0), [
      'init',
      '-b',
      branch,
      ...(bare ? ['--bare'] : []),
    ]).then(() => folder);
    templates.set(key, made);
  }
  return made;
}

export async function tempRepository(
  root: string,
  { branch = 'main', bare = false } = {},
): Promise<TempRepository> {
  const gitPath = await installedGit();
  fs.mkdirSync(root, { recursive: true });
  fs.cpSync(await template(branch, bare), root, { recursive: true });
  let minute = 1;
  const git = (...args: string[]): Promise<string> =>
    runGit(root, new Date(Date.UTC(2026, 0, 1, 0, minute++)), args);
  return {
    root,
    gitPath,
    git,
    commit: async (message, files = {}) => {
      for (const [file, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), content);
      }
      if (Object.keys(files).length === 0) {
        await git('commit', '--allow-empty', '-m', message);
      } else {
        await git('add', '--', ...Object.keys(files));
        await git('commit', '-m', message);
      }
    },
    resolve: async (...revisions) =>
      (await git('rev-parse', ...revisions)).trim().split('\n'),
  };
}

export function objectId(type: string, content: string): string {
  return createHash('sha1')
    .update(`${type} ${Buffer.byteLength(content)}\0${content}`)
    .digest('hex');
}

export function commitText(tree: string, message: string): string {
  const person = 'Test <test@example.com> 0 +0000';
  return `tree ${tree}\nauthor ${person}\ncommitter ${person}\n\n${message}\n`;
}

let gitPath: Promise<string> | undefined;

export function installedGit(): Promise<string> {
  gitPath ??= findGit().then((git) => {
    assert.ok(git.kind === 'found', 'git 2.52 or later is not installed');
    return git.path;
  });
  return gitPath;
}

let realGit: Promise<string> | undefined;

// Git for Windows' launcher on the PATH, which the code under test runs, takes
// longer to start than the git it starts
function fixtureGit(): Promise<string> {
  realGit ??= installedGit().then((launcher) => {
    const real = path.join(
      path.dirname(path.dirname(launcher)),
      'mingw64',
      'bin',
      'git.exe',
    );
    return process.platform === 'win32' && fs.existsSync(real)
      ? real
      : launcher;
  });
  return realGit;
}
