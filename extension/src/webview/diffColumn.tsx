import { useMemo } from 'react';
import { isLargeChange, type FileChange } from '../shared/protocol';
import { Column } from './column';
import { parsePatch, type DiffFile } from './diff';
import { DiffView } from './diffView';

// The files of a commit's diff in the commit's order, with its large files,
// which the diff leaves out, as placeholders until they are fetched
export function withLargeFiles(
  parsed: readonly DiffFile[],
  files: readonly FileChange[],
  largeFiles: ReadonlyMap<string, DiffFile>,
): DiffFile[] {
  const byPath = new Map(parsed.map((file) => [file.path, file]));
  const result: DiffFile[] = [];
  for (const change of files) {
    const file = byPath.get(change.path);
    if (file) {
      result.push(file);
      byPath.delete(change.path);
    } else if (isLargeChange(change)) {
      result.push(
        largeFiles.get(change.path) ?? {
          path: change.path,
          binary: false,
          hunks: [],
          placeholder: { lines: change.insertions + change.deletions },
        },
      );
    }
  }
  return [...result, ...byPath.values()];
}

export function Diff({
  selection,
  path,
  loading,
  files,
  patch,
  diffs,
  largeFiles,
  onLoadFile,
  fileContent,
  error,
}: {
  // The selected commit and file, which the diff starts over for
  selection: string;
  path: string | undefined;
  // The diff is on the way
  loading: boolean;
  files: readonly FileChange[];
  patch: string;
  // How many diffs have arrived, as the large files are fetched for each
  diffs: number;
  largeFiles: ReadonlyMap<string, DiffFile>;
  onLoadFile: (path: string) => void;
  // A file the commit didn't change, shown whole instead of a diff
  fileContent: { path: string; content: string; binary: boolean } | undefined;
  error: string | undefined;
}) {
  // Parsed apart from the large files, which come one by one
  const parsed = useMemo(() => parsePatch(patch), [patch]);
  const diffFiles = useMemo(
    () =>
      // One selected file is the whole diff
      path === undefined ? withLargeFiles(parsed, files, largeFiles) : parsed,
    [parsed, path, files, largeFiles],
  );
  const changes = useMemo(
    () => new Map(files.map((file) => [file.path, file])),
    [files],
  );

  // An error goes above the diff
  const errorRow = error && <div className="error">{error}</div>;

  return (
    <Column title="Diff">
      <DiffView
        key={selection}
        error={errorRow}
        files={diffFiles}
        changes={changes}
        whole={fileContent}
        loading={loading}
        diff={diffs}
        onLoad={onLoadFile}
      />
    </Column>
  );
}
