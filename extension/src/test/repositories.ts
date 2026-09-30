import * as assert from 'node:assert';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { Repository } from '../git/git';
import { getGitApi } from '../git/repository';
import type { Connection } from '../view';

export interface TempRepository {
  readonly root: string;
  readonly gitPath: string;
  git(...args: string[]): Promise<string>;
  commit(message: string, files?: Record<string, string>): Promise<void>;
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
  } catch {}
}

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

export async function openedRepository(root: string): Promise<Repository> {
  const opened = (await getGitApi()).getRepository(vscode.Uri.file(root));
  assert.ok(opened, `${root} not opened`);
  return opened;
}

export async function settle(
  root: string,
  connection?: Connection,
): Promise<void> {
  const git = await getGitApi();
  await git.getRepository(vscode.Uri.file(root))?.status();
  await connection?.refresh();
}
