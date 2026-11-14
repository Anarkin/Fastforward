import type { FileChange, StashInfo } from '../shared/protocol';
import { showFiles, showPatch, type PatchScope } from './diff';
import { runGit } from './run';

export interface Stash extends StashInfo {
  readonly untracked: string | undefined;
}

export async function listStashes(
  gitPath: string,
  root: string,
): Promise<Stash[]> {
  return parseStashes(
    await runGit(gitPath, root, [
      'stash',
      'list',
      '--format=%gd%x00%H%x00%P%x00%s',
    ]),
  );
}

export function parseStashes(output: string): Stash[] {
  return output.split('\n').flatMap((line): Stash[] => {
    const [name, commit, parents = '', message = ''] = line.split('\0');
    if (!name || !commit) {
      return [];
    }
    const [, , untracked] = parents.split(' ');
    return [{ name, commit, message, untracked }];
  });
}

export async function stashFiles(
  gitPath: string,
  cwd: string,
  stash: Stash,
  signal?: AbortSignal,
): Promise<FileChange[]> {
  const [tracked, untracked] = await Promise.all([
    showFiles(gitPath, cwd, stash.commit, signal),
    stash.untracked === undefined
      ? []
      : showFiles(gitPath, cwd, stash.untracked, signal),
  ]);
  return [
    ...tracked,
    ...untracked.map((file) => ({ ...file, status: 'U' as const })),
  ];
}

export async function stashPatch(
  gitPath: string,
  cwd: string,
  stash: Stash,
  scope: PatchScope = {},
  signal?: AbortSignal,
): Promise<string> {
  const [tracked, untracked] = await Promise.all([
    showPatch(gitPath, cwd, stash.commit, scope, signal),
    stash.untracked === undefined
      ? ''
      : showPatch(gitPath, cwd, stash.untracked, scope, signal),
  ]);
  return tracked + untracked;
}
