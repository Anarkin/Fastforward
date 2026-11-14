import type { ChangeArea, FileChange, LeftOut } from '../shared/protocol';
import { type DiffFile } from './diff';
import { filterWords, matchesFilter } from '../../../lib/page/fileFilter';

export function withLargeFiles(
  parsed: readonly DiffFile[],
  files: readonly FileChange[],
  leftOut: readonly LeftOut[],
  largeFiles: ReadonlyMap<string, DiffFile>,
  whitespaceOnly: ReadonlySet<string> = new Set(),
): DiffFile[] {
  const byPath = new Map(parsed.map((file) => [file.path, file]));
  const deferred = new Map(leftOut.map(({ path, lines }) => [path, lines]));
  const result: DiffFile[] = [];
  for (const change of files) {
    const file = byPath.get(change.path);
    byPath.delete(change.path);
    if (file && !deferred.has(change.path)) {
      result.push(file);
    } else if (deferred.has(change.path)) {
      result.push(deferredFile(change, deferred.get(change.path), largeFiles));
    } else if (whitespaceOnly.has(change.path)) {
      result.push(whitespaceOnlyFile(change.path));
    }
  }
  return [...result, ...byPath.values()];
}

function deferredFile(
  { path, oldPath }: Pick<FileChange, 'path' | 'oldPath'>,
  lines: number | undefined,
  largeFiles: ReadonlyMap<string, DiffFile>,
): DiffFile {
  return (
    largeFiles.get(path) ?? {
      path,
      ...(oldPath === undefined ? {} : { oldPath }),
      binary: false,
      hunks: [],
      placeholder: { lines },
    }
  );
}

function whitespaceOnlyFile(path: string): DiffFile {
  return { path, binary: false, hunks: [], whitespaceOnly: true };
}

export function shownFiles(
  parsed: readonly DiffFile[],
  path: string | undefined,
  files: readonly FileChange[],
  leftOut: readonly LeftOut[],
  largeFiles: ReadonlyMap<string, DiffFile>,
  whitespaceOnly: readonly string[] = [],
): DiffFile[] {
  if (path === undefined) {
    return withLargeFiles(
      parsed,
      files,
      leftOut,
      largeFiles,
      new Set(whitespaceOnly),
    );
  }
  const deferred = leftOut.find((file) => file.path === path);
  if (deferred) {
    return [
      deferredFile(
        files.find((file) => file.path === path) ?? {
          path,
          oldPath: undefined,
        },
        deferred.lines,
        largeFiles,
      ),
    ];
  }
  const shown = parsed.filter((file) => file.path === path);
  if (!whitespaceOnly.includes(path)) {
    return shown;
  }
  return shown.length === 0
    ? [whitespaceOnlyFile(path)]
    : shown.map((file) => ({ ...file, whitespaceOnly: true }));
}

export function filteredDiffFiles(
  files: readonly DiffFile[],
  path: string | undefined,
  filter: string | undefined,
): readonly DiffFile[] {
  const words = filterWords(filter ?? '');
  return path !== undefined || words.length === 0
    ? files
    : files.filter((file) => matchesFilter(words, file.path, file.oldPath));
}

export function diffSelection(
  root: string | undefined,
  hash: string | undefined,
  path: string | undefined,
  area?: ChangeArea,
): string {
  return JSON.stringify([root, hash, path, area]);
}
