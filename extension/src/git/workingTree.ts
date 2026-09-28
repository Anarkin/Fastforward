import type { FileChange } from '../shared/protocol';
import {
  changesArgs,
  diffArgs,
  parseChanges,
  pathspecs,
  type PatchScope,
} from './diff';
import { headCommit } from './history';
import { runGit, splitNul } from './run';

// The uncommitted changes, and what they were diffed against, so their patch
// is of the same changes: HEAD, or nothing before the first commit
export interface WorkingTree {
  readonly base: string;
  readonly files: readonly FileChange[];
}

// Uncommitted changes are the working tree and index against the base, plus
// untracked files
export async function workingTreeFiles(
  gitPath: string,
  cwd: string,
): Promise<WorkingTree> {
  const base =
    (await headCommit(gitPath, cwd)) ??
    (
      await runGit(gitPath, cwd, ['hash-object', '-t', 'tree', '--stdin'], {
        input: '',
      })
    ).trim();
  const [changes, untracked] = await Promise.all([
    runGit(gitPath, cwd, [...workingTreeDiff(base), ...changesArgs]),
    runGit(gitPath, cwd, ['ls-files', '--others', '--exclude-standard', '-z']),
  ]);
  return {
    base,
    files: [
      ...parseChanges(changes),
      ...splitNul(untracked)
        .filter(Boolean)
        .map((path) => ({
          path,
          oldPath: undefined,
          status: 'U' as const,
          insertions: 0,
          deletions: 0,
        })),
    ],
  };
}

function workingTreeDiff(base: string): string[] {
  return ['diff', base, '-M', ...diffArgs];
}

// Untracked files get their patch from diffing them against /dev/null, which
// git supports on Windows too, one process per file on every refresh; at most
// this many are included in the full patch, to keep huge untracked folders
// from flooding the view and spawning git for each of their files
const maxUntrackedPatches = 50;

export async function workingTreePatch(
  gitPath: string,
  cwd: string,
  { base, files }: WorkingTree,
  scope: PatchScope = {},
): Promise<string> {
  // A repository inside this one is listed as its folder, "nested/", which
  // has no patch
  const untrackedPatch = (file: string) =>
    file.endsWith('/')
      ? Promise.resolve('')
      : runGit(
          gitPath,
          cwd,
          ['diff', '--no-index', ...diffArgs, '--', '/dev/null', file],
          { okExitCodes: [0, 1] },
        );
  const { path } = scope;
  const untracked = files
    .filter((file) => file.status === 'U')
    .map((file) => file.path);
  if (path !== undefined && untracked.includes(path)) {
    return untrackedPatch(path);
  }
  const tracked = runGit(
    gitPath,
    cwd,
    [...workingTreeDiff(base), ...pathspecs(scope)],
    { pathspecMagic: (scope.exclude?.length ?? 0) > 0 },
  );
  if (path !== undefined) {
    return tracked;
  }
  // An untracked file that can't be read, like one being written, is left
  // out instead of failing the whole diff
  const [trackedPatch, untrackedPatches] = await Promise.all([
    tracked,
    Promise.allSettled(
      untracked.slice(0, maxUntrackedPatches).map(untrackedPatch),
    ),
  ]);
  return [
    trackedPatch,
    ...untrackedPatches.map((patch) =>
      patch.status === 'fulfilled' ? patch.value : '',
    ),
  ].join('');
}
