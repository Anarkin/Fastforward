import type { FileChange } from '../shared/protocol';
import {
  compareArgs,
  diffOptionArgs,
  listArgs,
  pathspecs,
  showArgs,
  showPatchArgs,
  type PatchScope,
} from '../../../components/diff/main/args';
import { keptFiles, keptPatch } from './runningDiff';
import { readPatch, type ReadPatch } from './patchBudget';
import { withoutFilesInside } from './patchText';
import { parseChanges } from './rawChanges';
import { runGit } from './run';

export async function showFiles(
  gitPath: string,
  cwd: string,
  hash: string,
  signal?: AbortSignal,
): Promise<FileChange[]> {
  return (
    (await keptFiles(gitPath, cwd, hash, signal)) ??
    changedFiles(gitPath, cwd, [...showArgs, ...listArgs, hash, '--'], signal)
  );
}

export async function commitPatch(
  gitPath: string,
  cwd: string,
  hash: string,
  scope: PatchScope = {},
  signal?: AbortSignal,
): Promise<ReadPatch> {
  return (
    (await keptPatch(gitPath, cwd, hash, scope, signal)) ??
    readPatch(gitPath, cwd, [showPatchArgs(hash, scope)], signal)
  );
}

export function compareFiles(
  gitPath: string,
  cwd: string,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<FileChange[]> {
  return changedFiles(
    gitPath,
    cwd,
    [...compareArgs, ...listArgs, from, to, '--'],
    signal,
  );
}

async function changedFiles(
  gitPath: string,
  cwd: string,
  args: readonly string[],
  signal: AbortSignal | undefined,
): Promise<FileChange[]> {
  return parseChanges(await runGit(gitPath, cwd, args, { signal }));
}

export function showPatch(
  gitPath: string,
  cwd: string,
  hash: string,
  scope: PatchScope = {},
  signal?: AbortSignal,
): Promise<string> {
  return patchOf(gitPath, cwd, [...showArgs, '--patch'], [hash], scope, signal);
}

export function comparePatch(
  gitPath: string,
  cwd: string,
  from: string,
  to: string,
  scope: PatchScope = {},
  signal?: AbortSignal,
): Promise<string> {
  return patchOf(gitPath, cwd, compareArgs, [from, to], scope, signal);
}

function patchOf(
  gitPath: string,
  cwd: string,
  args: readonly string[],
  revisions: readonly string[],
  scope: PatchScope,
  signal: AbortSignal | undefined,
): Promise<string> {
  if (scope.include?.length === 0) {
    return Promise.resolve('');
  }
  return runGit(
    gitPath,
    cwd,
    [
      ...args,
      ...diffOptionArgs(scope),
      ...revisions,
      '--',
      ...pathspecs(scope),
    ],
    { signal },
  ).then((patch) => withoutFilesInside(patch, scope));
}
