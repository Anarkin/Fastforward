import { useMemo, useState } from 'react';
import { comparedOf, comparisonLabel } from '../shared/comparisons';
import type { FileChange } from '../shared/protocol';
import {
  ancestorRows,
  changesTree,
  changesTreeElement,
  changesKey,
  changesTreeRows,
  filesKey,
  folderRowKey,
  listedTreeRows,
  treeFolders,
} from './changesTree';
import { Column } from './column';
import { AllFilesIcon, CollapseAllIcon, ExpandAllIcon } from './icons';
import { SkeletonRows, useSkeleton } from './skeleton';
import { keymap } from '../shared/keymap';
import { listMoveOf, type VisibleRows } from './listMoves';
import { keyPressed } from './shortcuts';
import { fileRowKey } from './tree';
import type { Folders } from './viewFolders';
import { VirtualRows, type ListedRows } from './virtualRows';

interface MovedCursor {
  readonly key: string;
  readonly from: string | undefined;
  readonly view: string;
}

export function filesCursor(
  moved: MovedCursor | undefined,
  selectedKey: string | undefined,
  view: string,
  keys: Pick<ListedRows, 'indexOf'>,
): string | undefined {
  return moved !== undefined &&
    moved.from === selectedKey &&
    moved.view === view &&
    keys.indexOf(moved.key) !== -1
    ? moved.key
    : selectedKey;
}

export function filesTitle(selection: string | undefined): string {
  const compared = comparedOf(selection);
  return compared ? `Files: ${comparisonLabel(compared)}` : 'Files';
}

export function noChangesText(
  selection: string | undefined,
): string | undefined {
  if (selection === undefined) {
    return undefined;
  }
  return comparedOf(selection)
    ? 'No differences, both have the same files'
    : 'No changes';
}

export function Files({
  title = 'Files',
  noChanges,
  showAll,
  onShowAll,
  closedFolders,
  onToggleClosedFolder,
  files,
  loading,
  tree,
  openedFolders,
  onToggleOpenFolder,
  onReplaceFolders,
  selected,
  onSelect,
  view,
}: {
  title?: string;
  noChanges?: string;
  showAll: boolean;
  onShowAll: (show: boolean) => void;
  closedFolders: ReadonlySet<string>;
  onToggleClosedFolder: (folder: string) => void;
  files: readonly FileChange[];
  loading: boolean;
  tree: readonly string[] | undefined;
  openedFolders: ReadonlySet<string>;
  onToggleOpenFolder: (folder: string) => void;
  onReplaceFolders: (folders: Folders) => void;
  selected: string | undefined;
  onSelect: (path: string | undefined) => void;
  view: string;
}) {
  const skeleton = useSkeleton(loading);
  const allPaths = showAll ? tree : undefined;
  const fileTree = useMemo(
    () => changesTree(files, allPaths),
    [files, allPaths],
  );
  const treeRows = useMemo(
    () => changesTreeRows(fileTree, closedFolders, openedFolders),
    [fileTree, closedFolders, openedFolders],
  );
  const folders = useMemo(() => treeFolders(fileTree), [fileTree]);
  const noFolders =
    folders.changed.length === 0 && folders.unchanged.length === 0;
  const hasHeader = files.length > 0;
  const listed = listedTreeRows(treeRows, hasHeader);
  const selectedKey =
    selected === undefined
      ? hasHeader
        ? changesKey
        : undefined
      : fileRowKey(selected);
  const [moved, setMoved] = useState<MovedCursor>();
  const cursor = filesCursor(moved, selectedKey, view, listed);
  const select = (path: string | undefined) => {
    setMoved(undefined);
    if (path !== selected) {
      onSelect(path);
    }
  };
  const toggle = (folder: string, changed: boolean) => {
    if (changed) {
      onToggleClosedFolder(folder);
    } else {
      onToggleOpenFolder(folder);
    }
  };
  const onKeyDown = (event: React.KeyboardEvent, visible: VisibleRows) => {
    const key = keyPressed(keymap.folder, event) ? 'folder' : listMoveOf(event);
    if (key === undefined) {
      return;
    }
    const action = filesKey(
      key,
      treeRows,
      hasHeader,
      cursor,
      selected,
      visible,
    );
    if (action === undefined) {
      return;
    }
    event.preventDefault();
    if (action.kind === 'toggle') {
      toggle(action.folder, action.changed);
    } else if (action.kind === 'select') {
      select(action.file);
    } else if (action.kind === 'cursor') {
      setMoved({ key: action.key, from: selectedKey, view });
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
      key={changesKey}
      className={`row group ${cursor === changesKey ? 'selected' : ''}`}
      onClick={() => select(undefined)}
    >
      <span className="path">All Changes</span>
    </div>
  );
  const offset = hasHeader ? 1 : 0;
  const rowOptions = {
    showsAll: showAll,
    onToggle: (folder: string, changed: boolean) => {
      setMoved({ key: folderRowKey(folder), from: selectedKey, view });
      toggle(folder, changed);
    },
    selected,
    onSelect: select,
    cursor,
  };
  return (
    <Column title={title} index={1} start={start}>
      {skeleton && <SkeletonRows count={6} />}
      <VirtualRows
        rows={listed}
        renderRow={(index) =>
          index < offset
            ? header
            : changesTreeElement(treeRows[index - offset], rowOptions)
        }
        ancestorsOf={(index) =>
          index < offset
            ? []
            : ancestorRows(treeRows, index - offset).map((row) => row + offset)
        }
        selectedKey={cursor}
        revealWith={allPaths}
        onKeyDown={onKeyDown}
      />
      {!loading && listed.count === 0 && noChanges && (
        <div className="empty-state">{noChanges}</div>
      )}
    </Column>
  );
}
