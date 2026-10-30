import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { comparedOf, comparisonLabel } from '../shared/comparisons';
import { shortHash } from '../shared/hashes';
import {
  workingTreeHash,
  type ChangeArea,
  type FileChange,
} from '../shared/protocol';
import {
  areaKey,
  changesTree,
  changesTreeElement,
  changesKey,
  changesTreeRows,
  filesAncestors,
  filesKey,
  filesRows,
  filesTreeItem,
  folderRowKey,
  listedFilesRows,
  shownFileKey,
  treeFolders,
  treeRowOf,
  type FilesRow,
} from './changesTree';
import { columnFocusOf } from '../../../ui/columnFocus';
import { Column } from './column';
import { filterWords, matchesFilter } from './fileFilter';
import { SearchButton, SearchRow } from '../../../ui/search';
import { useSettled } from '../../../ui/settled';
import {
  AllFilesIcon,
  CollapseAllIcon,
  ExpandAllIcon,
} from '../../../ui/icons';
import { SkeletonRows, useSkeleton } from '../../../ui/skeleton';
import { gitKeymap } from '../shared/keymap';
import { strings } from '../../../shared/strings';
import { listMoveOf, type VisibleRows } from '../../../ui/listMoves';
import { keyPressed } from '../../../ui/shortcuts';
import { fileRowKey } from './tree';
import type { Folders } from './viewFolders';
import { VirtualRows, type ListedRows } from '../../../ui/virtualRows';

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
  shownKey = selectedKey,
): string | undefined {
  return moved !== undefined &&
    moved.from === selectedKey &&
    moved.view === view &&
    keys.indexOf(moved.key) !== -1
    ? moved.key
    : shownKey;
}

export function filesReveal(
  rows: readonly FilesRow[],
  cursor: string | undefined,
  treeView: string | undefined,
): readonly unknown[] {
  const index =
    cursor === undefined ? -1 : listedFilesRows(rows).indexOf(cursor);
  const row = index === -1 ? undefined : treeRowOf(rows[index]);
  return [treeView, row?.kind === 'folder' ? row.open : undefined];
}

export function filesTitle(selection: string | undefined): string {
  if (selection === undefined) {
    return strings.files.title;
  }
  const compared = comparedOf(selection);
  if (compared) {
    return comparisonLabel(compared);
  }
  return selection === workingTreeHash
    ? strings.commits.uncommitted
    : shortHash(selection);
}

export function noChangesText(
  selection: string | undefined,
  error: string | undefined,
): string | undefined {
  if (selection === undefined || error !== undefined) {
    return undefined;
  }
  return comparedOf(selection)
    ? strings.files.noDifferences
    : strings.files.noChanges;
}

export function listsNothing({
  files,
  staged,
  allPaths,
  loading,
}: {
  files: readonly FileChange[];
  staged: readonly FileChange[] | undefined;
  allPaths: readonly string[] | undefined;
  loading: boolean;
}): boolean {
  return (
    !loading &&
    files.length === 0 &&
    staged === undefined &&
    (allPaths ?? []).length === 0
  );
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
        { area: undefined, files: [], allPaths: undefined },
        { area: 'staged', files: staged, allPaths: undefined },
        { area: 'unstaged', files, allPaths },
      ];
}

function filteredSide(side: Side, words: readonly string[]): Side {
  return words.length === 0
    ? side
    : {
        area: side.area,
        files: side.files.filter((file) =>
          matchesFilter(words, file.path, file.oldPath),
        ),
        allPaths: side.allPaths?.filter((path) => matchesFilter(words, path)),
      };
}

function toggled(folders: ReadonlySet<string>, folder: string): Set<string> {
  const next = new Set(folders);
  if (!next.delete(folder)) {
    next.add(folder);
  }
  return next;
}

const noneClosed: ReadonlySet<string> = new Set();

const settlingPaths = 20_000;

export function FileFilterField({
  query,
  input,
  onQuery,
  onLeave,
  onClose,
}: {
  query: string;
  input?: RefObject<HTMLInputElement | null>;
  onQuery: (query: string) => void;
  onLeave: () => void;
  onClose: () => void;
}) {
  return (
    <div className={`search-field ${query ? 'active' : ''}`}>
      <input
        ref={input}
        className="search-input"
        placeholder={strings.find.placeholder}
        spellCheck={false}
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => {
          if (keyPressed(gitKeymap.stopFinding, event)) {
            event.preventDefault();
            onClose();
          } else if (keyPressed(gitKeymap.toFiles, event)) {
            event.preventDefault();
            onLeave();
          }
        }}
      />
    </div>
  );
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
  filter,
  onFilter,
  filterAsked = 0,
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
  filter?: string;
  onFilter: (filter: string | undefined) => void;
  filterAsked?: number;
}) {
  const skeleton = useSkeleton(loading);
  const allPaths = showAll ? tree : undefined;
  const shownFilter = useSettled(
    filter ?? '',
    (allPaths?.length ?? 0) > settlingPaths,
  );
  const words = useMemo(() => filterWords(shownFilter), [shownFilter]);
  const filtering = words.length > 0;
  const sides = useMemo(
    () =>
      sidesOf(files, staged, allPaths).map((side) => filteredSide(side, words)),
    [files, staged, allPaths, words],
  );
  const trees = useMemo(
    () => sides.map((side) => changesTree(side.files, side.allPaths)),
    [sides],
  );
  const folders = useMemo(
    () =>
      treeFolders(
        sides.map((side, index) => ({ area: side.area, tree: trees[index] })),
      ),
    [sides, trees],
  );
  const searched = words.join(' ');
  const [folds, setFolds] = useState({ view, searched, closed: noneClosed });
  const closedWhileFiltering =
    folds.view === view && folds.searched === searched
      ? folds.closed
      : noneClosed;
  const foldWhileFiltering = (closed: ReadonlySet<string>) =>
    setFolds({ view, searched, closed });
  const shownClosed = filtering ? closedWhileFiltering : closedFolders;
  const shownOpened = useMemo(
    () =>
      filtering
        ? new Set(
            folders.unchanged.filter(
              (folder) => !closedWhileFiltering.has(folder),
            ),
          )
        : openedFolders,
    [filtering, folders, closedWhileFiltering, openedFolders],
  );
  const rows = useMemo(
    () =>
      filesRows(
        sides.map((side, index) => ({
          area: side.area,
          header: staged !== undefined || side.files.length > 0,
          rows: changesTreeRows(
            trees[index],
            foldersOn(shownClosed, side.area),
            foldersOn(shownOpened, side.area),
          ),
        })),
      ),
    [sides, trees, staged, shownClosed, shownOpened],
  );
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
  const cursor = filesCursor(
    moved,
    selectedKey,
    view,
    listed,
    selected !== undefined
      ? shownFileKey(selection.area, selected, listed)
      : selectedKey,
  );
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
    if (filtering) {
      foldWhileFiltering(toggled(closedWhileFiltering, key));
    } else if (changed) {
      onToggleClosedFolder(key);
    } else {
      onToggleOpenFolder(key);
    }
  };
  const onKeyDown = (event: React.KeyboardEvent, visible: VisibleRows) => {
    const key = keyPressed(gitKeymap.folder, event)
      ? 'folder'
      : listMoveOf(event);
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
          filtering
            ? foldWhileFiltering(
                new Set([...folders.changed, ...folders.unchanged]),
              )
            : onReplaceFolders({
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
          filtering
            ? foldWhileFiltering(noneClosed)
            : onReplaceFolders({
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
    words,
  });
  const input = useRef<HTMLInputElement>(null);
  const [clicked, setClicked] = useState(0);
  useEffect(() => {
    if (filterAsked + clicked > 0) {
      input.current?.focus();
      input.current?.select();
    }
  }, [filterAsked, clicked]);
  const toList = () => columnFocusOf(input.current)?.focus();
  const closeFilter = () => {
    toList();
    onFilter(undefined);
  };
  const nothingFound =
    filtering && !loading && !rows.some((row) => row.kind === 'tree');
  return (
    <Column
      title={title}
      index={1}
      start={start}
      search={
        <SearchButton
          title={strings.files.search}
          onClick={() => {
            onFilter(filter ?? '');
            setClicked((count) => count + 1);
          }}
        />
      }
      searching={
        filter !== undefined && (
          <SearchRow onClose={closeFilter}>
            <FileFilterField
              query={filter}
              input={input}
              onQuery={onFilter}
              onLeave={toList}
              onClose={closeFilter}
            />
          </SearchRow>
        )
      }
    >
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
        treeItemOf={(index) => filesTreeItem(rows, index)}
        label={title}
        selectedKey={cursor}
        revealWith={filesReveal(
          rows,
          cursor,
          allPaths === undefined ? undefined : view,
        )}
        onKeyDown={onKeyDown}
      />
      {nothingFound ? (
        <div className="row empty">{strings.files.noMatches}</div>
      ) : (
        listsNothing({ files, staged, allPaths, loading }) &&
        noChanges && <div className="row empty">{noChanges}</div>
      )}
    </Column>
  );
}
