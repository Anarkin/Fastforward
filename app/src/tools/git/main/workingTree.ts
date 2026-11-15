import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FileChange } from '../shared/protocol';
import { changesArgs, diffArgs, listArgs } from './diffArgs';
import { parseRawChanges, type RawChange, withBytes } from './rawChanges';
import { maxFileSize } from './files';
import { listUntracked } from './fileLists';
import { headCommit } from './commitLookup';
import { untrackedLines } from './lineCounts';
import { runGit, splitNul } from './run';
import { touchedChanges } from './touchedFiles';

export interface WorkingTreeDiff {
  readonly base: string | undefined;
  readonly reverse: boolean;
}

export interface WorkingTree extends WorkingTreeDiff {
  readonly files: readonly FileChange[];
  readonly untracked: readonly string[];
  readonly listedUntracked: readonly string[];
  readonly addedInConflict: readonly string[];
  readonly staged: readonly FileChange[] | undefined;
  readonly all: WorkingTree | undefined;
}

const againstIndex: WorkingTreeDiff = { base: undefined, reverse: false };

export const maxUntrackedPatches = 50;

export async function workingTreeFiles(
  gitPath: string,
  cwd: string,
  diff = againstIndex,
  signal?: AbortSignal,
  knownUntracked?: readonly string[],
  measured = true,
): Promise<WorkingTree> {
  const { base, reverse } = diff;
  const listing =
    knownUntracked === undefined
      ? listUntracked(gitPath, cwd, signal)
      : Promise.resolve(knownUntracked);
  const [trackedChanges, listedUntracked, staged, all] = await Promise.all([
    trackedListing(gitPath, cwd, diff, measured, signal),
    listing,
    base === undefined
      ? stagedFiles(gitPath, cwd, measured, signal)
      : undefined,
    base === undefined && measured
      ? sinceHead(gitPath, cwd, listing, signal)
      : undefined,
  ]);
  const addedInConflict =
    base === undefined && trackedChanges.some((file) => file.status === '?')
      ? await withoutOurSide(gitPath, cwd, signal)
      : new Set<string>();
  const changes = await Promise.all(
    trackedChanges.map(async (file) =>
      addedInConflict.has(file.path) ? addedOnDisk(file, cwd, measured) : file,
    ),
  );
  const tracked = new Set(trackedChanges.map((file) => file.path));
  const untracked = listedUntracked.filter((path) => !tracked.has(path));
  const untrackedFiles = await Promise.all(
    untracked.map(async (path, index): Promise<FileChange> => {
      const file = join(cwd, path);
      const countable = measured && !path.endsWith('/');
      const unmeasured = countable && index >= maxUntrackedPatches;
      const added =
        countable && !unmeasured ? await untrackedLines.of(file) : 0;
      const lines = added === 'tooLarge' ? 0 : added;
      const sized = added !== 0 || unmeasured;
      const stats = sized
        ? await lstat(file).catch(() => undefined)
        : undefined;
      const size = sized ? stats?.size : 0;
      const bytes =
        unmeasured && size !== undefined && size <= maxFileSize ? 0 : size;
      return {
        path,
        oldPath: undefined,
        status: reverse ? 'D' : 'U',
        insertions: reverse ? 0 : lines,
        deletions: reverse ? lines : 0,
        ...(bytes ? { bytes } : {}),
        ...(added === 'tooLarge' || (countable && index >= maxUntrackedPatches)
          ? { uncounted: true }
          : {}),
        ...(stats?.isSymbolicLink() ? { link: true as const } : {}),
      };
    }),
  );
  return {
    ...diff,
    files: [...changes, ...untrackedFiles],
    untracked,
    listedUntracked,
    addedInConflict: [...addedInConflict],
    staged,
    all,
  };
}

async function trackedListing(
  gitPath: string,
  cwd: string,
  diff: WorkingTreeDiff,
  measured: boolean,
  signal?: AbortSignal,
): Promise<FileChange[]> {
  const listed = (args: readonly string[]) =>
    runGit(gitPath, cwd, [...workingTreeDiff(diff), ...args, '--'], {
      signal,
    });
  const counted = measured
    ? await listed(changesArgs).catch(() => undefined)
    : undefined;
  if (counted !== undefined) {
    return trackedFiles(
      gitPath,
      cwd,
      parseRawChanges(counted),
      diff.reverse,
      true,
    );
  }
  const files = await trackedFiles(
    gitPath,
    cwd,
    parseRawChanges(await listed(listArgs)),
    diff.reverse,
    false,
  );
  return measured ? files.map((file) => ({ ...file, uncounted: true })) : files;
}

async function sinceHead(
  gitPath: string,
  cwd: string,
  listing: Promise<readonly string[]>,
  signal?: AbortSignal,
): Promise<WorkingTree> {
  const base =
    (await headCommit(gitPath, cwd)) ??
    (
      await runGit(gitPath, cwd, ['hash-object', '-t', 'tree', '--stdin'], {
        signal,
      })
    ).trim();
  return workingTreeFiles(
    gitPath,
    cwd,
    { base, reverse: false },
    signal,
    await listing,
  );
}

async function withoutOurSide(
  gitPath: string,
  cwd: string,
  signal?: AbortSignal,
): Promise<Set<string>> {
  const stages = new Map<string, Set<string>>();
  for (const entry of splitNul(
    await runGit(gitPath, cwd, ['ls-files', '-u', '-z'], { signal }),
  )) {
    const tab = entry.indexOf('\t');
    if (tab !== -1) {
      const path = entry.slice(tab + 1);
      const [, , stage = ''] = entry.slice(0, tab).split(' ');
      stages.set(path, (stages.get(path) ?? new Set()).add(stage));
    }
  }
  return new Set(
    [...stages].filter(([, staged]) => !staged.has('2')).map(([path]) => path),
  );
}

async function addedOnDisk(
  file: FileChange,
  cwd: string,
  measured: boolean,
): Promise<FileChange> {
  const onDisk = join(cwd, file.path);
  const stats = await lstat(onDisk).catch(() => undefined);
  if (stats === undefined) {
    return file;
  }
  const added = measured ? await untrackedLines.of(onDisk) : 0;
  const bytes = added !== 0 ? stats.size : 0;
  return {
    ...file,
    status: 'A',
    insertions: added === 'tooLarge' ? 0 : added,
    deletions: 0,
    ...(bytes ? { bytes } : {}),
    ...(added === 'tooLarge' ? { uncounted: true } : {}),
  };
}

async function stagedFiles(
  gitPath: string,
  cwd: string,
  measured: boolean,
  signal?: AbortSignal,
): Promise<FileChange[]> {
  const output = await runGit(
    gitPath,
    cwd,
    [
      'diff',
      '--cached',
      '-M',
      ...diffArgs,
      ...(measured ? changesArgs : listArgs),
    ],
    { signal },
  );
  const changes = parseRawChanges(output);
  return (measured ? await withBytes(gitPath, cwd, changes) : changes)
    .map(({ file }) => file)
    .filter((file) => file.status !== '?');
}

async function trackedFiles(
  gitPath: string,
  cwd: string,
  changes: readonly RawChange[],
  reverse: boolean,
  measured: boolean,
): Promise<FileChange[]> {
  const [sized, touched] = await Promise.all([
    measured
      ? withBytes(gitPath, cwd, changes, { fromDisk: true, reverse })
      : changes,
    touchedChanges(gitPath, cwd, changes, reverse, measured),
  ]);
  return onePerPath(
    sized
      .filter((_, index) => !touched.has(changes[index]))
      .map(({ file }) => file),
  );
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

export function workingTreeDiff({ base, reverse }: WorkingTreeDiff): string[] {
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
