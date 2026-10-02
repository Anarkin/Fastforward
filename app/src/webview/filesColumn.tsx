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
import type { VisibleRows } from './listMoves';
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

export function Files({
  title = 'Files',
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
  view,
}: {
  title?: string;
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
  view: string;
}) {
  const skeleton = useSkeleton(loading);
  const unchanged = showAll ? tree : undefined;
  const fileTree = useMemo(
    () => changesTree(files, unchanged),
    [files, unchanged],
  );
  const treeRows = useMemo(
    () => changesTreeRows(fileTree, closedFolders, openFolders),
    [fileTree, closedFolders, openFolders],
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
  const onKeyDown = (event: React.KeyboardEvent, visible: VisibleRows) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
      return;
    }
    const action = filesKey(
      event.key,
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
        setMoved({ key: action.key, from: selectedKey, view });
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
      if (changed) {
        onToggleClosedFolder(folder);
      } else {
        onToggleFolder(folder);
      }
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
        revealWith={unchanged}
        onKeyDown={onKeyDown}
      />
    </Column>
  );
}
