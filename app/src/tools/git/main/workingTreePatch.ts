import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  diffArgs,
  diffOptionArgs,
  pathspecs,
  type PatchScope,
} from '../../../lib/main/diffArgs';
import { stampOf } from './fileStamps';
import { maxFileSize } from './files';
import { withoutFilesInside } from './patchText';
import { runGit } from './run';
import {
  maxUntrackedPatches,
  workingTreeDiff,
  type WorkingTree,
} from './workingTree';

interface UntrackedPatch {
  readonly stamp: string;
  readonly patch: string;
}

export class UntrackedPatches extends Map<string, UntrackedPatch> {
  private chars = 0;

  constructor(private readonly maxChars: number) {
    super();
  }

  override get(file: string): UntrackedPatch | undefined {
    const kept = super.get(file);
    if (kept) {
      this.set(file, kept);
    }
    return kept;
  }

  override set(file: string, kept: UntrackedPatch): this {
    this.delete(file);
    if (kept.patch.length > this.maxChars) {
      return this;
    }
    super.set(file, kept);
    this.chars += kept.patch.length;
    for (const oldest of this.keys()) {
      if (this.chars <= this.maxChars) {
        break;
      }
      this.delete(oldest);
    }
    return this;
  }

  override delete(file: string): boolean {
    const kept = super.get(file);
    if (kept) {
      this.chars -= kept.patch.length;
    }
    return super.delete(file);
  }
}

export function stagedPatch(
  gitPath: string,
  cwd: string,
  scope: PatchScope = {},
  signal?: AbortSignal,
): Promise<string> {
  if (scope.include?.length === 0) {
    return Promise.resolve('');
  }
  return runGit(
    gitPath,
    cwd,
    [
      'diff',
      '--cached',
      '-M',
      ...diffArgs,
      ...diffOptionArgs(scope),
      '--',
      ...pathspecs(scope),
    ],
    { signal },
  ).then((patch) => withoutFilesInside(patch, scope));
}

const unmergedMarks = /^\* Unmerged path .*\n/gm;

export async function workingTreePatch(
  gitPath: string,
  cwd: string,
  workingTree: WorkingTree,
  scope: PatchScope = {},
  kept = new UntrackedPatches(0),
  signal?: AbortSignal,
): Promise<string> {
  const untrackedPatch = async (file: string) => {
    if (file.endsWith('/')) {
      return '';
    }
    const stats = await lstat(join(cwd, file)).catch(() => undefined);
    const stamp = stats && stampOf(stats, workingTree.reverse);
    const known = kept.get(file);
    if (stamp !== undefined && known?.stamp === stamp) {
      return known.patch;
    }
    const asked = file === '-' ? './-' : file;
    const sides = workingTree.reverse
      ? [asked, '/dev/null']
      : ['/dev/null', asked];
    const diffed = await runGit(
      gitPath,
      cwd,
      ['diff', '--no-index', ...diffArgs, '--', ...sides],
      { okExitCodes: [0, 1], signal },
    );
    const patch = asked === file ? diffed : named(diffed, asked, file);
    if (stats && stats.size <= maxFileSize) {
      kept.set(file, { stamp: stampOf(stats, workingTree.reverse), patch });
    }
    return patch;
  };
  const { path } = scope;
  const { untracked, addedInConflict } = workingTree;
  if (
    path !== undefined &&
    (untracked.includes(path) || addedInConflict.includes(path))
  ) {
    return untrackedPatch(path);
  }
  if (scope.include?.length === 0) {
    return '';
  }
  const tracked = runGit(
    gitPath,
    cwd,
    [
      ...workingTreeDiff(workingTree),
      ...diffOptionArgs(scope),
      '--',
      ...pathspecs(scope),
    ],
    { signal },
  ).then((patch) => patch.replace(unmergedMarks, ''));
  if (path !== undefined) {
    return withoutFilesInside(await tracked, scope);
  }
  const listed = new Set([...untracked, ...addedInConflict]);
  for (const file of kept.keys()) {
    if (!listed.has(file)) {
      kept.delete(file);
    }
  }
  const included = scope.include && new Set(scope.include);
  const [trackedPatch, untrackedPatches] = await Promise.all([
    tracked,
    Promise.allSettled(
      [...addedInConflict, ...untracked.slice(0, maxUntrackedPatches)]
        .filter((file) => !included || included.has(file))
        .map(untrackedPatch),
    ),
  ]);
  return [
    trackedPatch,
    ...untrackedPatches.map((patch) =>
      patch.status === 'fulfilled' ? patch.value : '',
    ),
  ].join('');
}

function named(patch: string, asked: string, file: string): string {
  const hunks = patch.indexOf('\n@@');
  const header = hunks === -1 ? patch : patch.slice(0, hunks);
  return (
    header.replaceAll(`/${asked}`, `/${file}`) + patch.slice(header.length)
  );
}
