import * as vscode from 'vscode';
import type { RefInfo } from '../shared/protocol';
import type { API, GitExtension, Repository } from './git';
import { RefType } from './refType';

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
    if (type === RefType.RemoteHead && ref.name.endsWith('/HEAD')) {
      return [];
    }
    const kind =
      type === RefType.Head
        ? 'branch'
        : type === RefType.RemoteHead
          ? 'remote'
          : 'tag';
    return [{ kind, name: ref.name, commit: ref.commit }];
  });
}
