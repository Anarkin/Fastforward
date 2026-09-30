import { useMemo } from 'react';
import { isLargeChange, type FileChange } from '../shared/protocol';
import { Column } from './column';
import { parsePatch, type DiffFile } from './diff';
import { DiffView, type WholeFile } from './diffView';

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
  selection: string;
  path: string | undefined;
  loading: boolean;
  files: readonly FileChange[];
  patch: string;
  diffs: number;
  largeFiles: ReadonlyMap<string, DiffFile>;
  onLoadFile: (path: string) => void;
  fileContent: WholeFile | undefined;
  error: string | undefined;
}) {
  const parsed = useMemo(() => parsePatch(patch), [patch]);
  const diffFiles = useMemo(
    () =>
      path === undefined ? withLargeFiles(parsed, files, largeFiles) : parsed,
    [parsed, path, files, largeFiles],
  );
  const changes = useMemo(
    () => new Map(files.map((file) => [file.path, file])),
    [files],
  );

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
