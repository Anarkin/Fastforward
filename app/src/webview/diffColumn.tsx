import { useMemo } from 'react';
import { isLargeChange, type FileChange } from '../shared/protocol';
import { Column } from './column';
import { parsePatch, type DiffFile } from './diff';
import { DiffView, type WholeFile } from './diffView';
import { EntireFileIcon, PinIcon } from './icons';

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

export function EntireFileButtons({
  entire,
  pinned,
  canShow,
  onEntire,
  onPin,
}: {
  entire: boolean;
  pinned: boolean;
  canShow: boolean;
  onEntire: (entire: boolean) => void;
  onPin: (pinned: boolean) => void;
}) {
  const shown = entire || pinned;
  return (
    <div className="nav-buttons entire-file">
      <button
        className={`nav-button toggle ${shown ? 'active' : ''}`}
        title={
          pinned
            ? 'Showing every file entire, as pinned'
            : 'Show the entire file, until you leave it'
        }
        aria-pressed={shown}
        disabled={!canShow || pinned}
        onClick={() => onEntire(!entire)}
      >
        <EntireFileIcon />
      </button>
      <button
        className={`nav-button toggle ${pinned ? 'active' : ''}`}
        title={
          pinned
            ? 'Unpin: show only the changes again'
            : 'Pin: always show entire files'
        }
        aria-pressed={pinned}
        onClick={() => onPin(!pinned)}
      >
        <PinIcon />
      </button>
    </div>
  );
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
  entireFile,
  minimap,
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
  entireFile: React.ReactNode;
  minimap: boolean;
}) {
  const parsed = useMemo(() => parsePatch(patch), [patch]);
  const diffFiles = useMemo(
    () =>
      path === undefined ? withLargeFiles(parsed, files, largeFiles) : parsed,
    [parsed, path, files, largeFiles],
  );
  const errorRow = error && <div className="error">{error}</div>;

  return (
    <Column title="Diff" start={entireFile}>
      <DiffView
        key={selection}
        error={errorRow}
        files={diffFiles}
        whole={fileContent}
        loading={loading}
        diff={diffs}
        onLoad={onLoadFile}
        minimap={minimap}
      />
    </Column>
  );
}
