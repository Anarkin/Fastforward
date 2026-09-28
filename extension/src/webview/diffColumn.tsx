import { useMemo } from 'react';
import { isLargeChange, type FileChange } from '../protocol';
import { Column } from './column';
import { parsePatch, type DiffFile } from './diff';
import { DiffView } from './diffView';

// The files of a commit's diff in the commit's order, with its large files,
// which the diff leaves out, as placeholders until they are fetched
export function withLargeFiles(
  parsed: readonly DiffFile[],
  files: readonly FileChange[],
  filePatches: ReadonlyMap<string, string>,
): DiffFile[] {
  const byPath = new Map(parsed.map((file) => [file.path, file]));
  const result: DiffFile[] = [];
  for (const change of files) {
    const file = byPath.get(change.path);
    if (file) {
      result.push(file);
      byPath.delete(change.path);
    } else if (isLargeChange(change)) {
      const loaded = filePatches.get(change.path);
      const [loadedFile] = loaded === undefined ? [] : parsePatch(loaded);
      result.push(
        loadedFile ?? {
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
  filePatches,
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
  filePatches: ReadonlyMap<string, string>;
  onLoadFile: (path: string) => void;
  // A file the commit didn't change, shown whole instead of a diff
  fileContent: { path: string; content: string; binary: boolean } | undefined;
  error: string | undefined;
}) {
  const diffFiles = useMemo(() => {
    const parsed = parsePatch(patch);
    // One selected file is the whole diff
    return path === undefined
      ? withLargeFiles(parsed, files, filePatches)
      : parsed;
  }, [patch, path, files, filePatches]);
  const changes = useMemo(
    () => new Map(files.map((file) => [file.path, file])),
    [files],
  );

  // Only the files' diffs; the commit's message is in the address bar, and
  // its author and date in the commit list; an error goes on top
  const summary = error && <div className="error">{error}</div>;

  return (
    <Column title="Diff">
      <DiffView
        key={selection}
        summary={summary}
        files={diffFiles}
        changes={changes}
        whole={fileContent}
        loading={loading}
        onLoad={onLoadFile}
      />
    </Column>
  );
}
