import { useMemo } from 'react';
import type { FileChange } from '../shared/protocol';
import { changesTreeElements, changesTreeRows } from './changesTree';
import { Column } from './column';
import { AllFilesIcon } from './icons';
import { SkeletonRows, useSkeleton } from './skeleton';
import { fileRowKey } from './tree';
import { VirtualRows } from './virtualRows';

export function Files({
  showAll,
  onShowAll,
  closedFolders,
  onToggleClosedFolder,
  files,
  loading,
  tree,
  openFolders,
  onToggleFolder,
  selected,
  onSelect,
}: {
  showAll: boolean;
  onShowAll: (show: boolean) => void;
  closedFolders: ReadonlySet<string>;
  onToggleClosedFolder: (folder: string) => void;
  files: readonly FileChange[];
  loading: boolean;
  tree: readonly string[] | undefined;
  openFolders: ReadonlySet<string>;
  onToggleFolder: (folder: string) => void;
  selected: string | undefined;
  onSelect: (path: string | undefined) => void;
}) {
  const skeleton = useSkeleton(loading);
  const unchanged = showAll ? tree : undefined;
  const treeRows = useMemo(
    () => changesTreeRows(files, closedFolders, unchanged, openFolders),
    [files, closedFolders, unchanged, openFolders],
  );
  const start = (
    <div className="nav-buttons all-files">
      <button
        className={`nav-button toggle ${showAll ? 'active' : ''}`}
        title="Show All Files"
        aria-pressed={showAll}
        onClick={() => onShowAll(!showAll)}
      >
        <AllFilesIcon />
      </button>
    </div>
  );
  const header = (
    <div
      key="changes"
      className={`row group counted ${selected === undefined ? 'selected' : ''}`}
      onClick={() => onSelect(undefined)}
    >
      <span className="path">All Changes</span>
    </div>
  );
  const fileRows = changesTreeElements({
    rows: treeRows,
    showsAll: showAll,
    onToggle: (folder, changed) =>
      changed ? onToggleClosedFolder(folder) : onToggleFolder(folder),
    selected,
    onSelect,
  });
  return (
    <Column title="Files" index={1} start={start}>
      {skeleton && <SkeletonRows count={6} />}
      <VirtualRows
        rows={files.length > 0 ? [header, ...fileRows] : fileRows}
        selectedKey={selected === undefined ? undefined : fileRowKey(selected)}
      />
    </Column>
  );
}
