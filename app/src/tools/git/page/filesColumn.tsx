import { useMemo, useState } from 'react';
import { type ChangeArea } from '../shared/protocol';
import {
  areaKey,
  changesTree,
  changesTreeRows,
  folderRowKey,
  treeFolders,
} from './changesRows';
import {
  changesKey,
  filesAncestors,
  filesKey,
  filesRows,
  filesTreeItem,
  keptFileRows,
  listedFilesRows,
  shownFileKey,
  steppedFileRow,
  treeRowOf,
} from './filesRows';
import { ChangesTreeItem } from './changesTree';
import { Column } from './column';
import { narrows, searchFilter } from '../../../lib/shared/filter';
import { noSearch } from '../../../lib/shared/searchOptions';
import { SearchButton } from '../../../lib/page/search';
import { useSettled } from './settled';
import {
  AllFilesIcon,
  CollapseAllIcon,
  ExpandAllIcon,
} from '../../../lib/page/icons';
import { useSkeleton } from './skeletonDelay';
import { SkeletonRows } from './skeleton';
import { gitKeymap } from './keymap';
import { strings } from '../../../lib/shared/strings';
import { listMoveOf, type VisibleRows } from '../../../lib/page/listMoves';
import { keyPressed, useBinding } from '../../../lib/page/shortcuts';
import { fileRowKey } from './treeLayout';
import { VirtualRows } from '../../../lib/page/virtualRows';
import { useShell } from '../../../shell/page/store';
import {
  activeColumnOf,
  fileCursorOf,
  fileFilterOf,
  folderViewOf,
  openingOf,
  shownFoldersOf,
} from './gitSelectors';
import { useGit, useGitActions } from './store';
import { treeOf } from './tabView';
import {
  listsNothing,
  sidesOf,
  filteredSide,
  toggled,
  foldersOn,
} from './filesSides';
import { filesTitle, noChangesText, headerTitle } from './filesTitles';
import { filesCursor, filesReveal } from './filesCursor';
import { FileFilterField } from './filesFilterField';
import { noneClosed, useFilesFilter } from './filesFilter';
import { ColumnStatus } from './columnStatusLine';
import { filesCounted } from './columnStatus';

const settlingPaths = 20_000;

export function Files() {
  const hash = useGit((state) => state.tab.hash);
  const title = filesTitle(hash);
  const noChanges = useGit((state) =>
    noChangesText(state.tab.hash, state.tab.error),
  );
  const showAll = useGit((state) => state.showAllFiles);
  const files = useGit((state) => state.tab.files);
  const staged = useGit((state) => state.tab.staged);
  const changes = useGit((state) => state.tab.all ?? state.tab.files);
  const loading = useGit((state) => state.tab.filesLoading || openingOf(state));
  const tree = useGit((state) => treeOf(state.tab));
  const { closed: closedFolders, open: openedFolders } = useGit(shownFoldersOf);
  const selected = useGit((state) => state.tab.path);
  const area = useGit((state) => state.tab.area);
  const view = useGit((state) => folderViewOf(state.tab));
  const root = useGit((state) => state.tab.root);
  const filter = useGit(fileFilterOf);
  const filtersHere = useGit((state) => activeColumnOf(state) === 'files');
  const {
    changeShowAllFiles: onShowAll,
    toggleFolder,
    replaceFolders: onReplaceFolders,
    selectFile: onSelect,
    filterFiles: onFilter,
    moveFilesCursor,
    filesScrollOf,
    keepFilesScroll,
  } = useGitActions();
  const [filterAsked, setFilterAsked] = useState(0);
  useBinding(
    gitKeymap.find,
    () => {
      setFilterAsked((count) => count + 1);
      if (filter === undefined) {
        onFilter('');
      }
    },
    filtersHere,
  );
  const scrolling = useShell((state) => state.scrolling);
  const skeleton = useSkeleton(loading);
  const allPaths = showAll ? tree : undefined;
  const shownFilter = useSettled(
    filter ?? noSearch,
    (allPaths?.length ?? 0) > settlingPaths,
  );
  const words = useMemo(
    () => searchFilter(shownFilter.query, shownFilter.options),
    [shownFilter],
  );
  const filtering = narrows(words);
  const counted = useMemo(() => filesCounted(changes, words), [changes, words]);
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
  const {
    closedWhileFiltering,
    foldWhileFiltering,
    input,
    toList,
    closeFilter,
    openFilter,
  } = useFilesFilter({ view, words, filter, onFilter, filterAsked });
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
  const moved = useGit(fileCursorOf);
  const setMoved = moveFilesCursor;
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
      toggleFolder('closed', key);
    } else {
      toggleFolder('open', key);
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
    filter: words,
  });
  const treeAwaited = showAll && tree === undefined;
  const keptScroll = treeAwaited ? undefined : filesScrollOf(view);
  const nothingFound =
    filtering && !loading && !rows.some((row) => row.kind === 'tree');
  return (
    <Column
      focusName="files"
      title={title}
      index={1}
      start={start}
      status={
        <ColumnStatus loading={loading} font="proportional">
          {counted}
        </ColumnStatus>
      }
      search={
        <SearchButton title={strings.files.search} onClick={openFilter} />
      }
      searching={
        filter !== undefined && (
          <FileFilterField
            query={filter.query}
            options={filter.options}
            found={keptFileRows(rows, selection)}
            input={input}
            onQuery={onFilter}
            onOptions={(options) => onFilter(filter.query, options)}
            onStep={(step) => {
              const next = steppedFileRow(rows, selection, step);
              if (next !== undefined) {
                select(next.path, next.area);
              }
            }}
            onLeave={toList}
            onClose={closeFilter}
          />
        )
      }
    >
      {skeleton && <SkeletonRows count={6} />}
      <VirtualRows
        key={root}
        placeKey={
          treeAwaited
            ? `${view}
tree`
            : view
        }
        initialOffset={keptScroll ?? 0}
        onScrolled={
          treeAwaited ? undefined : (offset) => keepFilesScroll(view, offset)
        }
        revealAtStart={keptScroll === undefined}
        scrolling={scrolling}
        wholeRows
        rows={listed}
        renderRow={(index) => {
          const row = rows[index];
          const treeRow = treeRowOf(row);
          return treeRow ? (
            <ChangesTreeItem row={treeRow} {...rowOptions(row.area)} />
          ) : (
            header(row.area)
          );
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
