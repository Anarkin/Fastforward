import { createReadStream, type Stats } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { collapseThreshold, type FileChange } from '../shared/protocol';
import {
  changesArgs,
  diffOptionArgs,
  diffArgs,
  parseRawChanges,
  pathspecs,
  type PatchScope,
  withBytes,
} from './diff';
import { isBinary, maxFileSize } from './files';
import { headCommit } from './history';
import { runGit, splitNul } from './run';

export interface WorkingTree {
  readonly base: string;
  readonly files: readonly FileChange[];
}

export type UntrackedPatches = Map<
  string,
  { readonly stamp: string; readonly patch: string }
>;

const maxUntrackedPatches = 50;

async function addedLines(file: string): Promise<number> {
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
        return collapseThreshold + 1;
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
  const trackedChanges = await withoutTouched(
    gitPath,
    cwd,
    await withBytes(gitPath, cwd, parseRawChanges(changes), cwd),
  );
  const tracked = new Set(trackedChanges.map((file) => file.path));
  const untrackedFiles = await Promise.all(
    splitNul(untracked)
      .filter((path) => path && !tracked.has(path))
      .map(async (path, index): Promise<FileChange> => {
        const file = join(cwd, path);
        const insertions =
          index < maxUntrackedPatches && !path.endsWith('/')
            ? await addedLines(file)
            : 0;
        const bytes =
          insertions > 0 ? (await lstat(file).catch(() => undefined))?.size : 0;
        return {
          path,
          oldPath: undefined,
          status: 'U',
          insertions,
          deletions: 0,
          ...(bytes ? { bytes } : {}),
        };
      }),
  );
  return {
    base,
    files: [...trackedChanges, ...untrackedFiles],
  };
}

// git runs with diff.autoRefreshIndex=false (see gitConfigArgs), so git diff
// lists a file whose stat changed but whose content didn't as modified
export async function withoutTouched(
  gitPath: string,
  cwd: string,
  changes: readonly { readonly raw: string; readonly file: FileChange }[],
): Promise<FileChange[]> {
  const suspects = changes.flatMap(({ raw, file }) => {
    const [oldMode, mode, object, , status] = raw.slice(1).split(' ');
    return status === 'M' &&
      mode === oldMode &&
      mode.startsWith('100') &&
      !file.path.includes('\n') &&
      !file.path.startsWith('"')
      ? [{ path: file.path, object }]
      : [];
  });
  const hashes =
    suspects.length === 0
      ? []
      : await runGit(gitPath, cwd, ['hash-object', '--stdin-paths'], {
          input: suspects.map(({ path }) => `${path}\n`).join(''),
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

function workingTreeDiff(base: string): string[] {
  return ['diff', base, '-M', ...diffArgs];
}

export async function workingTreePatch(
  gitPath: string,
  cwd: string,
  { base, files }: WorkingTree,
  scope: PatchScope = {},
  kept: UntrackedPatches = new Map(),
): Promise<string> {
  const untrackedPatch = async (file: string) => {
    if (file.endsWith('/')) {
      return '';
    }
    const stats = await lstat(join(cwd, file)).catch(() => undefined);
    const stamp = stats && stampOf(stats);
    const known = kept.get(file);
    if (stamp !== undefined && known?.stamp === stamp) {
      return known.patch;
    }
    const patch = await runGit(
      gitPath,
      cwd,
      ['diff', '--no-index', ...diffArgs, '--', '/dev/null', file],
      { okExitCodes: [0, 1] },
    );
    if (stats && stats.size <= maxFileSize) {
      kept.set(file, { stamp: stampOf(stats), patch });
    }
    return patch;
  };
  const { path } = scope;
  const untracked = files
    .filter((file) => file.status === 'U')
    .map((file) => file.path);
  if (path !== undefined && untracked.includes(path)) {
    return untrackedPatch(path);
  }
  if (scope.include?.length === 0) {
    return '';
  }
  const tracked = runGit(gitPath, cwd, [
    ...workingTreeDiff(base),
    ...diffOptionArgs(scope),
    ...pathspecs(scope),
  ]);
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

function stampOf({ size, mtimeMs, ctimeMs, ino }: Stats): string {
  return `${size} ${mtimeMs} ${ctimeMs} ${ino}`;
}
