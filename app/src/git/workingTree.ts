import { createReadStream, type Stats } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FileChange } from '../shared/protocol';
import {
  changesArgs,
  diffOptionArgs,
  diffArgs,
  isNullId,
  parseRawChanges,
  pathspecs,
  type PatchScope,
  type RawChange,
  withBytes,
} from './diff';
import { isBinary, maxFileSize } from './files';
import { runGit, splitNul } from './run';

export interface WorkingTreeDiff {
  readonly base: string | undefined;
  readonly reverse: boolean;
}

export interface WorkingTree extends WorkingTreeDiff {
  readonly files: readonly FileChange[];
  readonly untracked: readonly string[];
  readonly staged: readonly FileChange[] | undefined;
}

const againstIndex: WorkingTreeDiff = { base: undefined, reverse: false };

export type UntrackedPatches = Map<
  string,
  { readonly stamp: string; readonly patch: string }
>;

const maxUntrackedPatches = 50;

async function addedLines(file: string): Promise<number | 'tooLarge'> {
  let lines = 0;
  let last = 0x0a;
  let first = true;
  try {
    const stats = await lstat(file);
    if (stats.isSymbolicLink()) {
      return 1;
    }
    if (!stats.isFile()) {
      return 0;
    }
    for await (const chunk of createReadStream(file)) {
      if (!(chunk instanceof Buffer)) {
        continue;
      }
      if (first && isBinary(chunk)) {
        return 0;
      }
      if (stats.size > maxFileSize) {
        return 'tooLarge';
      }
      first = false;
      for (
        let i = chunk.indexOf(0x0a);
        i !== -1;
        i = chunk.indexOf(0x0a, i + 1)
      ) {
        lines++;
      }
      last = chunk.at(-1) ?? last;
    }
  } catch {
    return 0;
  }
  return last === 0x0a ? lines : lines + 1;
}

export async function workingTreeFiles(
  gitPath: string,
  cwd: string,
  diff = againstIndex,
  signal?: AbortSignal,
): Promise<WorkingTree> {
  const { base, reverse } = diff;
  const [changes, listed, staged] = await Promise.all([
    runGit(gitPath, cwd, [...workingTreeDiff(diff), ...changesArgs], {
      signal,
    }),
    runGit(gitPath, cwd, ['ls-files', '--others', '--exclude-standard', '-z'], {
      signal,
    }),
    base === undefined ? stagedFiles(gitPath, cwd, signal) : undefined,
  ]);
  const trackedChanges = onePerPath(
    await withoutTouched(
      gitPath,
      cwd,
      await withBytes(gitPath, cwd, parseRawChanges(changes), {
        fromDisk: true,
        reverse,
      }),
      reverse,
    ),
  );
  const tracked = new Set(trackedChanges.map((file) => file.path));
  const untracked = splitNul(listed).filter(
    (path) => path && !tracked.has(path),
  );
  const untrackedFiles = await Promise.all(
    untracked.map(async (path, index): Promise<FileChange> => {
      const file = join(cwd, path);
      const added =
        index < maxUntrackedPatches && !path.endsWith('/')
          ? await addedLines(file)
          : 0;
      const lines = added === 'tooLarge' ? 0 : added;
      const bytes =
        added !== 0 ? (await lstat(file).catch(() => undefined))?.size : 0;
      return {
        path,
        oldPath: undefined,
        status: reverse ? 'D' : 'U',
        insertions: reverse ? 0 : lines,
        deletions: reverse ? lines : 0,
        ...(bytes ? { bytes } : {}),
        ...(added === 'tooLarge' ? { tooLargeToCount: true } : {}),
      };
    }),
  );
  return {
    ...diff,
    files: [...trackedChanges, ...untrackedFiles],
    untracked,
    staged,
  };
}

async function stagedFiles(
  gitPath: string,
  cwd: string,
  signal?: AbortSignal,
): Promise<FileChange[]> {
  const output = await runGit(
    gitPath,
    cwd,
    ['diff', '--cached', '-M', ...diffArgs, ...changesArgs],
    { signal },
  );
  return (await withBytes(gitPath, cwd, parseRawChanges(output)))
    .map(({ file }) => file)
    .filter((file) => file.status !== '?');
}

function onePerPath(files: readonly FileChange[]): FileChange[] {
  const byPath = new Map<string, FileChange>();
  for (const file of files) {
    const kept = byPath.get(file.path);
    if (kept === undefined || kept.status === '?') {
      byPath.set(file.path, file);
    }
  }
  return [...byPath.values()];
}

export function uncommittedCount({ files, staged = [] }: WorkingTree): number {
  return new Set([...files, ...staged].map((file) => file.path)).size;
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
      ...pathspecs(scope),
    ],
    { signal },
  );
}

export async function withoutTouched(
  gitPath: string,
  cwd: string,
  changes: readonly RawChange[],
  reverse = false,
): Promise<FileChange[]> {
  const suspects = changes.flatMap(
    ({ oldMode, newMode, oldId, newId, file }) =>
      file.status === 'M' &&
      newMode === oldMode &&
      newMode.startsWith('100') &&
      isNullId(reverse ? oldId : newId)
        ? [{ path: file.path, object: reverse ? newId : oldId }]
        : [],
  );
  const hashes =
    suspects.length === 0
      ? []
      : await runGit(gitPath, cwd, ['hash-object', '--stdin-paths'], {
          input: suspects.map(({ path }) => `${quoted(path)}\n`).join(''),
        }).then(
          (output) => output.split('\n'),
          () => [],
        );
  const touched = new Set(
    suspects
      .filter(({ object }, index) => hashes[index] === object)
      .map(({ path }) => path),
  );
  return changes
    .map(({ file }) => file)
    .filter((file) => !touched.has(file.path));
}

function quoted(path: string): string {
  // oxlint-disable-next-line no-control-regex
  const escaped = path.replace(/[\\"\x00-\x1f]/g, (char) =>
    char === '\\' || char === '"'
      ? `\\${char}`
      : `\\${char.charCodeAt(0).toString(8).padStart(3, '0')}`,
  );
  return `"${escaped}"`;
}

function workingTreeDiff({ base, reverse }: WorkingTreeDiff): string[] {
  const against = base === undefined ? ['--ours'] : [base];
  return reverse
    ? [
        'diff',
        ...against,
        '-M',
        '-R',
        ...diffArgs,
        '--src-prefix=b/',
        '--dst-prefix=a/',
      ]
    : ['diff', ...against, '-M', ...diffArgs];
}

export async function workingTreePatch(
  gitPath: string,
  cwd: string,
  workingTree: WorkingTree,
  scope: PatchScope = {},
  kept: UntrackedPatches = new Map(),
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
  const { untracked } = workingTree;
  if (path !== undefined && untracked.includes(path)) {
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
      ...pathspecs(scope),
    ],
    { signal },
  );
  if (path !== undefined) {
    return tracked;
  }
  const listed = new Set(untracked);
  for (const file of kept.keys()) {
    if (!listed.has(file)) {
      kept.delete(file);
    }
  }
  const included = scope.include && new Set(scope.include);
  const [trackedPatch, untrackedPatches] = await Promise.all([
    tracked,
    Promise.allSettled(
      untracked
        .slice(0, maxUntrackedPatches)
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

function stampOf(
  { size, mtimeMs, ctimeMs, ino }: Stats,
  reverse: boolean,
): string {
  return `${size} ${mtimeMs} ${ctimeMs} ${ino}${reverse ? ' reverse' : ''}`;
}
