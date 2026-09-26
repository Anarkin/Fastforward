import * as vscode from 'vscode';
import type { RefInfo } from '../protocol';
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
