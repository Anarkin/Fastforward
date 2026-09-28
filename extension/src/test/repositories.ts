import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { getGitApi } from '../git/repository';
import type { Connection } from '../view';

// Temp repositories for the tests that run git, made with the git the Git
// extension uses

export interface TempRepository {
  readonly root: string;
  // Each command a minute after the one before, so commits made one after
  // another are in a fixed order, and have the same hashes every run
  git(...args: string[]): Promise<string>;
  // With these files written and added, or else empty
  commit(message: string, files?: Record<string, string>): Promise<void>;
  // The commits of these revisions, from one git process
  resolve(...revisions: string[]): Promise<string[]>;
}

// A new folder in the temp folder; its repositories go in it, rather than in
// another repository, where they would be untracked files for the view to
// diff on every refresh
export function tempFolder(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `fastforward-${name}-`));
}

// Best effort, because git's read-only object files can't always be removed on
// Windows, and the Git extension keeps reading a repository it opened
export function removeFolder(folder: string): void {
  try {
    fs.rmSync(folder, { recursive: true, force: true });
  } catch {
    // Left for the OS to clean up
  }
}

// A repository at this folder, made if missing; a bare one is a remote to
// push to
export async function tempRepository(
  root: string,
  { branch = 'main', bare = false } = {},
): Promise<TempRepository> {
  const gitPath = (await getGitApi()).git.path;
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
          // For this command only, as the view under test runs git too
          env: {
            ...process.env,
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

// The Git extension reads changes in its own time; once it has, a refresh
// brings the view up to date, so neither lands in the middle of a test
export async function settle(
  root: string,
  connection?: Connection,
): Promise<void> {
  const git = await getGitApi();
  await git.getRepository(vscode.Uri.file(root))?.status();
  await connection?.refresh();
}
