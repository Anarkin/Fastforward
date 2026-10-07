import { useMemo, useState } from 'react';
import { comparedOf, comparisonLabel } from '../shared/comparisons';
import type { ChangeArea, FileChange } from '../shared/protocol';
import {
  areaKey,
  changesTree,
  changesTreeElement,
  changesKey,
  changesTreeRows,
  filesAncestors,
  filesKey,
  filesRows,
  folderRowKey,
  listedFilesRows,
  treeFolders,
  treeRowOf,
} from './changesTree';
import { Column } from './column';
import { AllFilesIcon, CollapseAllIcon, ExpandAllIcon } from './icons';
import { SkeletonRows, useSkeleton } from './skeleton';
import { keymap } from '../shared/keymap';
import { strings } from '../shared/strings';
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
  return compared
    ? strings.files.compared(comparisonLabel(compared))
    : strings.files.title;
}

export function noChangesText(
  selection: string | undefined,
): string | undefined {
  if (selection === undefined) {
    return undefined;
  }
  return comparedOf(selection)
    ? strings.files.noDifferences
    : strings.files.noChanges;
}

interface Side {
  readonly area: ChangeArea | undefined;
  readonly files: readonly FileChange[];
  readonly allPaths: readonly string[] | undefined;
}

function sidesOf(
  files: readonly FileChange[],
  staged: readonly FileChange[] | undefined,
  allPaths: readonly string[] | undefined,
): Side[] {
  return staged === undefined
    ? [{ area: undefined, files, allPaths }]
    : [
        { area: 'staged', files: staged, allPaths: undefined },
        { area: 'unstaged', files, allPaths },
      ];
}

function foldersOn(
  folders: ReadonlySet<string>,
  area: ChangeArea | undefined,
): ReadonlySet<string> {
  if (area === undefined) {
    return folders;
  }
  const prefix = areaKey(area, '');
  return new Set(
    [...folders]
      .filter((folder) => folder.startsWith(prefix))
      .map((folder) => folder.slice(prefix.length)),
  );
}

function headerTitle(area: ChangeArea | undefined): string {
  return area === undefined
    ? strings.files.allChanges
    : area === 'staged'
      ? strings.files.staged
      : strings.files.unstaged;
}

export function Files({
  title = strings.files.title,
  noChanges,
  showAll,
  onShowAll,
  closedFolders,
  onToggleClosedFolder,
  files,
  staged,
  loading,
  tree,
  openedFolders,
  onToggleOpenFolder,
  onReplaceFolders,
  selected,
  area,
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
  staged?: readonly FileChange[];
  loading: boolean;
  tree: readonly string[] | undefined;
  openedFolders: ReadonlySet<string>;
  onToggleOpenFolder: (folder: string) => void;
  onReplaceFolders: (folders: Folders) => void;
  selected: string | undefined;
  area?: ChangeArea;
  onSelect: (path: string | undefined, area?: ChangeArea) => void;
  view: string;
}) {
  const skeleton = useSkeleton(loading);
  const allPaths = showAll ? tree : undefined;
  const sides = useMemo(
    () => sidesOf(files, staged, allPaths),
    [files, staged, allPaths],
  );
  const trees = useMemo(
    () => sides.map((side) => changesTree(side.files, side.allPaths)),
    [sides],
  );
  const rows = useMemo(
    () =>
      filesRows(
        sides.map((side, index) => ({
          area: side.area,
          header: side.area !== undefined || side.files.length > 0,
          rows: changesTreeRows(
            trees[index],
            foldersOn(closedFolders, side.area),
            foldersOn(openedFolders, side.area),
          ),
        })),
      ),
    [sides, trees, closedFolders, openedFolders],
  );
  const folders = useMemo(() => {
    const all = { changed: [] as string[], unchanged: [] as string[] };
    sides.forEach((side, index) => {
      const { changed, unchanged } = treeFolders(trees[index]);
      const keyed = (folder: string) => areaKey(side.area, folder);
      all.changed.push(...changed.map(keyed));
      all.unchanged.push(...unchanged.map(keyed));
    });
    return all;
  }, [sides, trees]);
  const noFolders =
    folders.changed.length === 0 && folders.unchanged.length === 0;
  const listed = listedFilesRows(rows);
  const selection = {
    area: staged === undefined ? undefined : area,
    path: selected,
  };
  const headerKey = areaKey(selection.area, changesKey);
  const selectedKey =
    selected !== undefined
      ? areaKey(selection.area, fileRowKey(selected))
      : listed.indexOf(headerKey) !== -1
        ? headerKey
        : undefined;
  const [moved, setMoved] = useState<MovedCursor>();
  const cursor = filesCursor(moved, selectedKey, view, listed);
  const select = (path: string | undefined, side?: ChangeArea) => {
    setMoved(undefined);
    if (path !== selection.path || side !== selection.area) {
      onSelect(path, side);
    }
  };
  const toggle = (
    side: ChangeArea | undefined,
    folder: string,
    changed: boolean,
  ) => {
    const key = areaKey(side, folder);
    if (changed) {
      onToggleClosedFolder(key);
    } else {
      onToggleOpenFolder(key);
    }
  };
  const onKeyDown = (event: React.KeyboardEvent, visible: VisibleRows) => {
    const key = keyPressed(keymap.folder, event) ? 'folder' : listMoveOf(event);
    if (key === undefined) {
      return;
    }
    const action = filesKey(key, rows, cursor, selection, visible);
    if (action === undefined) {
      return;
    }
    event.preventDefault();
    if (action.kind === 'toggle') {
      toggle(action.area, action.folder, action.changed);
    } else if (action.kind === 'select') {
      select(action.file, action.area);
    } else if (action.kind === 'cursor') {
      setMoved({ key: action.key, from: selectedKey, view });
    }
  };
  const start = (
    <div className="nav-buttons all-files">
      <button
        className={`nav-button toggle ${showAll ? 'active' : ''}`}
        title={strings.files.showAll}
        aria-pressed={showAll}
        onClick={() => onShowAll(!showAll)}
      >
        <AllFilesIcon />
      </button>
      <button
        className="nav-button"
        title={strings.files.collapseAll}
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
        title={strings.files.expandAll}
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
  const header = (side: ChangeArea | undefined) => {
    const key = areaKey(side, changesKey);
    return (
      <div
        key={key}
        className={`row group ${cursor === key ? 'selected' : ''}`}
        onClick={() => select(undefined, side)}
      >
        <span className="path">{headerTitle(side)}</span>
      </div>
    );
  };
  const rowOptions = (side: ChangeArea | undefined) => ({
    area: side,
    showsAll: showAll,
    onToggle: (folder: string, changed: boolean) => {
      setMoved({
        key: areaKey(side, folderRowKey(folder)),
        from: selectedKey,
        view,
      });
      toggle(side, folder, changed);
    },
    selected: side === selection.area ? selected : undefined,
    onSelect: (path: string | undefined) => select(path, side),
    cursor,
  });
  return (
    <Column title={title} index={1} start={start}>
      {skeleton && <SkeletonRows count={6} />}
      <VirtualRows
        rows={listed}
        renderRow={(index) => {
          const row = rows[index];
          const treeRow = treeRowOf(row);
          return treeRow
            ? changesTreeElement(treeRow, rowOptions(row.area))
            : header(row.area);
        }}
        ancestorsOf={(index) => filesAncestors(rows, index)}
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
