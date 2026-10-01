import { useMemo, useState } from 'react';
import type { FileChange } from '../shared/protocol';
import {
  ancestorRows,
  changesTreeElements,
  changesKey,
  changesTreeRows,
  filesKey,
  folderRowKey,
  treeFolders,
  treeRowKey,
} from './changesTree';
import { Column } from './column';
import { AllFilesIcon, CollapseAllIcon, ExpandAllIcon } from './icons';
import { SkeletonRows, useSkeleton } from './skeleton';
import type { VisibleRows } from './listMoves';
import { fileRowKey } from './tree';
import type { Folders } from './viewFolders';
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
  onReplaceFolders,
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
  onReplaceFolders: (folders: Folders) => void;
  selected: string | undefined;
  onSelect: (path: string | undefined) => void;
}) {
  const skeleton = useSkeleton(loading);
  const unchanged = showAll ? tree : undefined;
  const treeRows = useMemo(
    () => changesTreeRows(files, closedFolders, unchanged, openFolders),
    [files, closedFolders, unchanged, openFolders],
  );
  const folders = useMemo(
    () => treeFolders(files, unchanged),
    [files, unchanged],
  );
  const noFolders =
    folders.changed.length === 0 && folders.unchanged.length === 0;
  const hasHeader = files.length > 0;
  const selectedKey =
    selected === undefined
      ? hasHeader
        ? changesKey
        : undefined
      : fileRowKey(selected);
  const [moved, setMoved] = useState<{
    readonly key: string;
    readonly from: string | undefined;
  }>();
  const cursor =
    moved !== undefined &&
    moved.from === selectedKey &&
    treeRows.some((row) => treeRowKey(row) === moved.key)
      ? moved.key
      : selectedKey;
  const onKeyDown = (event: React.KeyboardEvent, visible: VisibleRows) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
      return;
    }
    const action = filesKey(event.key, treeRows, hasHeader, cursor, visible);
    if (action === undefined) {
      return;
    }
    event.preventDefault();
    if (action.kind === 'toggle') {
      if (action.changed) {
        onToggleClosedFolder(action.folder);
      } else {
        onToggleFolder(action.folder);
      }
    } else if (action.kind === 'cursor') {
      if ('file' in action) {
        setMoved(undefined);
        onSelect(action.file);
      } else {
        setMoved({ key: action.key, from: selectedKey });
      }
    }
  };
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
      <button
        className="nav-button"
        title="Collapse All"
        disabled={noFolders}
        onClick={() =>
          onReplaceFolders({
            open: new Set(),
            closed: new Set(folders.changed),
          })
        }
      >
        <CollapseAllIcon />
      </button>
      <button
        className="nav-button"
        title="Expand All"
        disabled={noFolders}
        onClick={() =>
          onReplaceFolders({
            open: new Set(folders.unchanged),
            closed: new Set(),
          })
        }
      >
        <ExpandAllIcon />
      </button>
    </div>
  );
  const header = (
    <div
      key="changes"
      className={`row group counted ${cursor === changesKey ? 'selected' : ''}`}
      onClick={() => onSelect(undefined)}
    >
      <span className="path">All Changes</span>
    </div>
  );
  const fileRows = changesTreeElements({
    rows: treeRows,
    showsAll: showAll,
    onToggle: (folder, changed) => {
      setMoved({ key: folderRowKey(folder), from: selectedKey });
      if (changed) {
        onToggleClosedFolder(folder);
      } else {
        onToggleFolder(folder);
      }
    },
    selected: cursor === selectedKey ? selected : undefined,
    onSelect,
    cursor,
  });
  return (
    <Column title="Files" index={1} start={start}>
      {skeleton && <SkeletonRows count={6} />}
      <VirtualRows
        rows={files.length > 0 ? [header, ...fileRows] : fileRows}
        ancestorsOf={(index) => {
          const offset = files.length > 0 ? 1 : 0;
          return index < offset
            ? []
            : ancestorRows(treeRows, index - offset).map((row) => row + offset);
        }}
        selectedKey={cursor}
        onKeyDown={onKeyDown}
      />
    </Column>
  );
}
