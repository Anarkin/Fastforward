import * as path from 'node:path';
import * as vscode from 'vscode';
import type { CommitInfo, RefInfo } from '../protocol';
import type { API, GitExtension, Repository } from './git';

// git.d.ts declares RefType as a const enum, which esbuild can't inline from a
// declaration file, so the values are repeated here
const refTypeHead = 0;
const refTypeRemoteHead = 1;

export async function getGitApi(): Promise<API> {
  const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!extension) {
    throw new Error('The built-in Git extension is not available');
  }
  const exports = extension.isActive
    ? extension.exports
    : await extension.activate();
  return exports.getAPI(1);
}

export function pickRepository(git: API): Repository | undefined {
  const active = vscode.window.activeTextEditor?.document.uri;
  return (active && git.getRepository(active)) ?? git.repositories[0];
}

export function repositoryName(repository: Repository): string {
  return path.basename(repository.rootUri.fsPath);
}

export async function listRefs(repository: Repository): Promise<RefInfo[]> {
  const refs = await repository.getRefs({});
  return refs.flatMap((ref): RefInfo[] => {
    if (!ref.name || !ref.commit) {
      return [];
    }
    const type: number = ref.type;
    const kind =
      type === refTypeHead
        ? 'branch'
        : type === refTypeRemoteHead
          ? 'remote'
          : 'tag';
    return [{ kind, name: ref.name, commit: ref.commit }];
  });
}

export async function listCommits(
  repository: Repository,
  ref: string | undefined,
): Promise<CommitInfo[]> {
  const commits = await repository.log({
    maxEntries: 300,
    shortStats: true,
    refNames: ref ? [ref] : undefined,
  });
  return commits.map((commit) => ({
    hash: commit.hash,
    subject: commit.message.split('\n', 1)[0],
    message: commit.message,
    parents: commit.parents,
    authorName: commit.authorName ?? '',
    authorEmail: commit.authorEmail ?? '',
    authorDate: commit.authorDate?.getTime() ?? 0,
    files: commit.shortStat?.files ?? 0,
  }));
}
