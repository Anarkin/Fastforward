import { createReadStream, type Stats } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FileChange } from '../shared/protocol';
import {
  changesArgs,
  diffOptionArgs,
  diffArgs,
  gitQuoted,
  isNullId,
  listArgs,
  parseRawChanges,
  pathspecs,
  type PatchScope,
  type RawChange,
  withBytes,
  withoutFilesInside,
} from './diff';
import { isBinary, maxFileSize } from './files';
import { headCommit } from './history';
import { runGit, splitNul } from './run';

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

type Counted = number | 'tooLarge';

export class LineCounts {
  private readonly known = new Map<
    string,
    { readonly stamp: string; readonly lines: Counted }
  >();

  constructor(
    private readonly maxFiles: number,
    private readonly count: (file: string) => Promise<Counted> = addedLines,
  ) {}

  async of(file: string): Promise<Counted> {
    const stats = await lstat(file).catch(() => undefined);
    if (stats === undefined) {
      return this.count(file);
    }
    const stamp = stampOf(stats, false);
    const known = this.known.get(file);
    const lines = known?.stamp === stamp ? known.lines : await this.count(file);
    this.known.delete(file);
    this.known.set(file, { stamp, lines });
    for (const oldest of this.known.keys()) {
      if (this.known.size <= this.maxFiles) {
        break;
      }
      this.known.delete(oldest);
    }
    return lines;
  }
}

const untrackedLines = new LineCounts(10_000);

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
    runGit(
      gitPath,
      cwd,
      [...workingTreeDiff(diff), ...(measured ? changesArgs : listArgs)],
      {
        signal,
      },
    ).then((changes) =>
      trackedFiles(gitPath, cwd, parseRawChanges(changes), reverse, measured),
    ),
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
  const added = measured ? await untrackedLines.of(onDisk) : 0;
  const bytes =
    added !== 0 ? (await lstat(onDisk).catch(() => undefined))?.size : 0;
  return {
    ...file,
    status: 'A',
    insertions: added === 'tooLarge' ? 0 : added,
    deletions: 0,
    ...(bytes ? { bytes } : {}),
    ...(added === 'tooLarge' ? { uncounted: true } : {}),
  };
}

async function listUntracked(
  gitPath: string,
  cwd: string,
  signal?: AbortSignal,
): Promise<readonly string[]> {
  const { args, paths } = untrackedListing();
  return paths(await runGit(gitPath, cwd, args, { signal }));
}

export function untrackedListing(platform = process.platform): {
  readonly args: readonly string[];
  readonly paths: (output: string) => string[];
} {
  if (platform !== 'win32') {
    return {
      args: ['ls-files', '--others', '--exclude-standard', '-z'],
      paths: (output) => splitNul(output).filter(Boolean),
    };
  }
  return {
    args: [
      '-c',
      'core.fscache=true',
      'status',
      '--porcelain=v2',
      '-z',
      '--untracked-files=all',
      '--ignore-submodules=all',
      '--no-renames',
    ],
    paths: (output) =>
      splitNul(output).flatMap((record) =>
        record.startsWith('? ') ? [record.slice(2)] : [],
      ),
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
  ).then((patch) => withoutFilesInside(patch, scope));
}

export async function withoutTouched(
  gitPath: string,
  cwd: string,
  changes: readonly RawChange[],
  reverse = false,
): Promise<FileChange[]> {
  const touched = await touchedChanges(gitPath, cwd, changes, reverse, true);
  return changes
    .filter((change) => !touched.has(change))
    .map(({ file }) => file);
}

async function touchedChanges(
  gitPath: string,
  cwd: string,
  changes: readonly RawChange[],
  reverse: boolean,
  counted: boolean,
): Promise<ReadonlySet<RawChange>> {
  const unread = changes.filter(
    ({ oldMode, newMode, oldId, newId, file }) =>
      file.status === 'M' &&
      newMode === oldMode &&
      newMode.startsWith('100') &&
      isNullId(reverse ? oldId : newId),
  );
  const suspects = unread.flatMap((change) =>
    !counted ||
    (change.linesCounted &&
      change.file.insertions + change.file.deletions === 0)
      ? [
          {
            change,
            path: change.file.path,
            object: reverse ? change.newId : change.oldId,
          },
        ]
      : [],
  );
  const hashes =
    suspects.length === 0
      ? []
      : await fileHashes.of(
          gitPath,
          cwd,
          suspects.map(({ path }) => path),
        );
  return new Set([
    ...unread.filter(({ linesCounted }) => counted && !linesCounted),
    ...suspects
      .filter(({ object }, index) => hashes[index] === object)
      .map(({ change }) => change),
  ]);
}

type Hasher = (
  gitPath: string,
  cwd: string,
  files: readonly string[],
) => Promise<readonly string[]>;

const hashObjects: Hasher = (gitPath, cwd, files) =>
  runGit(gitPath, cwd, ['hash-object', '--stdin-paths'], {
    input: files.map((file) => `${gitQuoted(file)}\n`).join(''),
  }).then(
    (output) => output.split('\n'),
    () => [],
  );

export class FileHashes {
  private readonly known = new Map<
    string,
    { readonly stamp: string; readonly hash: string }
  >();

  constructor(
    private readonly maxFiles: number,
    private readonly hash: Hasher = hashObjects,
  ) {}

  async of(
    gitPath: string,
    cwd: string,
    files: readonly string[],
  ): Promise<(string | undefined)[]> {
    const stamps = await Promise.all(
      files.map((file) =>
        lstat(join(cwd, file)).then(
          (stats) => stampOf(stats, false),
          () => undefined,
        ),
      ),
    );
    const keys = files.map((file) => join(cwd, file));
    const unknown = files.flatMap((_, index) => {
      const stamp = stamps[index];
      return stamp !== undefined && this.known.get(keys[index])?.stamp !== stamp
        ? [index]
        : [];
    });
    const hashed =
      unknown.length === 0
        ? []
        : await this.hash(
            gitPath,
            cwd,
            unknown.map((index) => files[index]),
          );
    const fresh = new Map(unknown.map((index, at) => [index, hashed[at]]));
    const hashes = files.map((_, index) => {
      if (fresh.has(index)) {
        return fresh.get(index) || undefined;
      }
      const known = this.known.get(keys[index]);
      return known?.stamp === stamps[index] ? known?.hash : undefined;
    });
    for (const [index, hash] of hashes.entries()) {
      const stamp = stamps[index];
      if (hash !== undefined && stamp !== undefined) {
        this.known.delete(keys[index]);
        this.known.set(keys[index], { stamp, hash });
      }
    }
    for (const oldest of this.known.keys()) {
      if (this.known.size <= Math.max(this.maxFiles, files.length)) {
        break;
      }
      this.known.delete(oldest);
    }
    return hashes;
  }
}

const fileHashes = new FileHashes(10_000);

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

function stampOf(
  { size, mtimeMs, ctimeMs, ino }: Stats,
  reverse: boolean,
): string {
  return `${size} ${mtimeMs} ${ctimeMs} ${ino}${reverse ? ' reverse' : ''}`;
}
