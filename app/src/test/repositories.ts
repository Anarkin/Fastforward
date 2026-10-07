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

const unremoved: string[] = [];

// On Windows a folder can't be removed while a process a test started still
// runs in it; that fails the run once all tests are done, as failing the
// teardown would skip the rest of its suite
export function removeFolder(folder: string): void {
  try {
    fs.rmSync(folder, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  } catch (error) {
    unremoved.push(error instanceof Error ? error.message : folder);
  }
}

suiteTeardown(() => {
  assert.deepStrictEqual(unremoved.splice(0), [], 'folders left behind');
});

// The system or global config can turn the ownership check off with
// safe.directory, as CI runners do for every folder
const ownedByAnother = {
  GIT_TEST_ASSUME_DIFFERENT_OWNER: '1',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
};

export async function asIfOwnedByAnother(
  run: () => Promise<void>,
): Promise<void> {
  const saved = Object.keys(ownedByAnother).map(
    (key) => [key, process.env[key]] as const,
  );
  Object.assign(process.env, ownedByAnother);
  try {
    await run();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
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

export async function tempRepository(
  root: string,
  { branch = 'main', bare = false } = {},
): Promise<TempRepository> {
  const gitPath = await installedGit();
  fs.mkdirSync(root, { recursive: true });
  let minute = 0;
  const git = (...args: string[]): Promise<string> => {
    const date = new Date(Date.UTC(2026, 0, 1, 0, minute++)).toISOString();
    return new Promise((resolve, reject) => {
      execFile(
        gitPath,
        ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args],
        {
          cwd: root,
          env: {
            ...process.env,
            // Leaves out the user's config, which may sign commits or run
            // hooks, but not the system's, whose defaults the app reads too
            GIT_CONFIG_GLOBAL: '/dev/null',
            GIT_AUTHOR_DATE: date,
            GIT_COMMITTER_DATE: date,
          },
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(`git ${args.join(' ')} failed: ${stderr}`));
          } else {
            resolve(stdout);
          }
        },
      );
    });
  };
  await git('init', '-b', branch, ...(bare ? ['--bare'] : []));
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
