import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  type Direction,
  type CheckoutTarget,
  type TabInfo,
  type TabMessage,
  type ToHost,
  type ToWebview,
  type Bookmark,
  type DiffLayout,
  type TextRequest,
} from '../shared/protocol';
import { CheckedOutBranch, DetachedHead } from './bubbles';
import { checkoutCommit, checkoutOptions, checkoutRef } from './checkout';
import {
  columnsClass,
  listError,
  shownSelection,
  ColumnResizingProvider,
  useColumnWidths,
} from './columns';
import {
  adjacentColumn,
  columnFocusAttribute,
  columnOf,
  columnOrder,
  columnStep,
  forwardedColumn,
  shownColumns,
  type ColumnName,
} from './activeColumn';
import { Commits, settling } from './commitList';
import { useShortcuts } from './shortcuts';
import {
  ContextMenu,
  OpenContextMenu,
  type ContextMenuItem,
  type MenuTarget,
  type OpenMenu,
} from './contextMenu';
import { Diff, DiffOptions, diffSelection } from './diffColumn';
import { Files, filesTitle, noChangesText } from './filesColumn';
import { foldersOf } from './fileTree';
import { compareWith } from '../shared/comparisons';
import { hasRef } from '../shared/refNames';
import { AddressBar, NavButtons } from './navBar';
import { TabBar } from './tabBar';
import { TitleBar, windowTitle } from './titleBar';
import {
  noFolders,
  openFolders,
  replaceFolders,
  seeView,
  shownFolders,
  toggleFolder,
  type Folders,
  type ViewFolders,
} from './viewFolders';
import { emptyTabView, reduceTabView, treeOf, treeToLoad } from './tabView';
import { bookmarkOptions, toggleBookmark } from './bookmarks';
import { addNotice, Notices, type Notice } from './notices';
import { repositoryMenuItems } from './repositoryMenu';

interface Props {
  name: string;
  post: (message: ToHost) => void;
  listen: (handler: (message: ToWebview) => void) => () => void;
}

export function App({ name, post: postToHost, listen }: Props) {
  const outbox = useMemo(() => settling(postToHost), [postToHost]);
  const post = outbox.send;
  const [tabs, setTabs] = useState<readonly TabInfo[]>();
  const [recent, setRecent] = useState<readonly TabInfo[]>([]);
  const [notices, setNotices] = useState<readonly Notice[]>([]);
  const noticeCount = useRef(0);
  const dismissNotice = useCallback(
    (id: number) =>
      setNotices((shown) => shown.filter((notice) => notice.id !== id)),
    [],
  );
  const selections = useRef(0);
  const [tab, dispatch] = useReducer(reduceTabView, emptyTabView);
  const {
    root: activeTab,
    repository,
    history,
    scrollTarget,
    workingTree,
    hash,
    files,
    filesLoading,
    patchLoading,
    path,
    entireFile,
    patch,
    diffs,
    fileContent,
    largeFiles,
    texts,
    fetching,
    applyingSolo,
    back,
    forward,
    hashLookup,
    commitSearch,
    error,
  } = tab;
  const [entireFilePinned, setEntireFilePinned] = useState(false);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);
  const [autoFetch, setAutoFetch] = useState(false);
  const [autoFetchMinutes, setAutoFetchMinutes] = useState(0);
  const [diffLayout, setDiffLayout] = useState<DiffLayout>('inline');
  const [collapseMerges, setCollapseMerges] = useState(false);
  const [solo, setSolo] = useState(false);
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [folders, setFolders] = useState<ViewFolders>(noFolders);
  const folderView = JSON.stringify([activeTab, hash]);
  useEffect(() => {
    setFolders((all) => seeView(all, folderView));
  }, [folderView]);
  const { open: openedFolders, closed: closedFolders } = shownFolders(
    folders,
    folderView,
  );
  const [bookmarks, setBookmarks] = useState<readonly Bookmark[]>([]);
  const [menu, setMenu] = useState<OpenMenu>();
  const closeMenu = useCallback(() => setMenu(undefined), []);
  const saveColumnWidths = useCallback(
    (widths: readonly number[]) => post({ type: 'setColumnWidths', widths }),
    [post],
  );
  const [commitsShown, setCommitsShown] = useState(true);
  useShortcuts({ c: () => setCommitsShown((shown) => !shown) });
  const hiddenColumns = useMemo(() => [!commitsShown, false], [commitsShown]);
  const {
    container: columnsContainer,
    template: columnsTemplate,
    load: loadColumnWidths,
    resizing,
  } = useColumnWidths(saveColumnWidths, hiddenColumns);
  const [activeColumn, setActiveColumn] = useState<ColumnName>('commits');
  const focusColumn = useCallback(
    (column: ColumnName) => {
      const target = columnsContainer.current?.children[
        columnOrder.indexOf(column)
      ]?.querySelector<HTMLElement>(`[${columnFocusAttribute}]`);
      target?.focus();
      return target;
    },
    [columnsContainer],
  );

  useEffect(() => {
    const onMessage = (message: ToWebview) => {
      switch (message.type) {
        case 'layout':
          loadColumnWidths(message.columnWidths, message.defaultColumnWidths);
          setCollapseMerges(message.collapseMerges);
          setEntireFilePinned(message.entireFilePinned);
          setIgnoreWhitespace(message.ignoreWhitespace);
          setWordWrap(message.wordWrap);
          setDiffLayout(message.diffLayout);
          setShowAllFiles(message.showAllFiles);
          setAutoFetch(message.autoFetch);
          setAutoFetchMinutes(message.autoFetchMinutes);
          break;
        case 'solo':
          setSolo(message.solo);
          break;
        case 'tabs':
          setTabs(message.tabs);
          setRecent(message.recent);
          dispatch(message);
          break;
        case 'notice': {
          const id = ++noticeCount.current;
          setNotices((shown) =>
            addNotice(shown, {
              id,
              level: message.level,
              message: message.message,
              shownAt: performance.now(),
            }),
          );
          break;
        }
        case 'bookmarks':
          setBookmarks(message.bookmarks);
          break;
        default:
          dispatch(message);
      }
    };
    const stop = listen(onMessage);
    post({ type: 'ready' });
    return stop;
  }, [post, listen, loadColumnWidths]);

  const log = useCallback(
    (message: string) => post({ type: 'log', level: 'info', message }),
    [post],
  );

  const postTab = useCallback(
    (message: TabMessage) => {
      if (activeTab !== undefined) {
        post({ ...message, root: activeTab });
      }
    },
    [post, activeTab],
  );

  const onScrolled = useCallback(
    (top: string, offset: number) =>
      postTab({ type: 'scrolled', hash: top, offset }),
    [postTab],
  );

  const loadCommits = useCallback(
    (start: number, generation: number) =>
      postTab({ type: 'loadCommits', generation, start }),
    [postTab],
  );

  const refs = repository?.refs ?? [];
  const refsByCommit = useMemo(
    () => Map.groupBy(repository?.refs ?? [], (info) => info.commit),
    [repository],
  );

  const detached =
    repository && !repository.head ? repository.headCommit : undefined;
  const opening = activeTab !== undefined && history === undefined && !error;
  const layoutSelection = shownSelection(hash, workingTree);
  const activeShown = shownColumns(commitsShown, layoutSelection).includes(
    activeColumn,
  );
  useEffect(() => {
    if (!activeShown) {
      const [first] = shownColumns(commitsShown, layoutSelection);
      if (first) {
        focusColumn(first);
      }
    }
  }, [activeShown, commitsShown, layoutSelection, focusColumn]);

  const selectCommit = (
    next: string | undefined,
    replace = false,
    repeat = false,
  ) => {
    const target = next === hash ? undefined : next;
    const selection = ++selections.current;
    dispatch({ type: 'showCommit', hash: target, selection });
    if (activeTab !== undefined) {
      outbox.settle(
        {
          type: 'selectCommit',
          hash: target,
          replace,
          selection,
          root: activeTab,
        },
        repeat,
      );
    }
  };
  const compareCommit = (added: string) => {
    const next = compareWith(hash, added);
    if (next !== hash) {
      selectCommit(next);
    }
  };
  const lookupHash = useCallback(
    (query: string) => postTab({ type: 'lookupHash', query }),
    [postTab],
  );
  const searchCommits = useCallback(
    (query: string) => postTab({ type: 'searchCommits', query }),
    [postTab],
  );
  const navigate = useCallback(
    (direction: Direction, steps: number) =>
      postTab({ type: 'navigate', direction, steps }),
    [postTab],
  );

  useEffect(() => {
    const buttons: Record<number, Direction> = { 3: 'back', 4: 'forward' };
    const onMouseUp = (event: MouseEvent) => {
      const direction = buttons[event.button];
      if (direction) {
        event.preventDefault();
        navigate(direction, 1);
      }
    };
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, [navigate]);
  const jump = (target: string | undefined) => {
    if (target) {
      postTab({ type: 'jump', hash: target });
    }
  };
  const loadFileDiff = useCallback(
    (file: string) => {
      if (hash) {
        postTab({ type: 'loadFileDiff', hash, path: file, diff: diffs });
      }
    },
    [hash, diffs, postTab],
  );

  const loadTexts = useCallback(
    (requests: TextRequest[]) => {
      if (hash) {
        postTab({ type: 'loadTexts', hash, diff: diffs, texts: requests });
      }
    },
    [hash, diffs, postTab],
  );

  const selectFile = (next: string | undefined) => {
    if (!hash) {
      return;
    }
    dispatch({ type: 'showFile', path: next });
    postTab({ type: 'selectFile', hash, path: next });
  };

  const commitTree = treeOf(tab);
  const treeNeeded = showAllFiles ? treeToLoad(tab) : undefined;
  useEffect(() => {
    if (treeNeeded) {
      dispatch({ type: 'requestTree', hash: treeNeeded });
      if (activeTab !== undefined) {
        outbox.follow({ type: 'loadTree', hash: treeNeeded, root: activeTab });
      }
    }
  }, [treeNeeded, activeTab, outbox]);

  useEffect(() => {
    if (!showAllFiles || path === undefined) {
      return;
    }
    setFolders((all) => openFolders(all, folderView, foldersOf(path)));
  }, [showAllFiles, path, folderView]);

  const toggleFolderOf = (kind: keyof Folders) => (folder: string) =>
    setFolders((all) => toggleFolder(all, folderView, kind, folder));
  const toggleOpenFolder = toggleFolderOf('open');
  const toggleClosedFolder = toggleFolderOf('closed');

  const changeShowAllFiles = (show: boolean) => {
    setShowAllFiles(show);
    post({ type: 'setShowAllFiles', show });
  };

  const showEntireFile = (entire: boolean) => {
    dispatch({ type: 'showEntireFile', entire });
    postTab({ type: 'showEntireFile', entire });
  };
  const changeIgnoreWhitespace = (ignore: boolean) => {
    setIgnoreWhitespace(ignore);
    post({ type: 'setIgnoreWhitespace', ignore });
  };
  const changeWordWrap = (wrap: boolean) => {
    setWordWrap(wrap);
    post({ type: 'setWordWrap', wrap });
  };
  useShortcuts({ w: () => changeWordWrap(!wordWrap) });
  const changeDiffLayout = (layout: DiffLayout) => {
    setDiffLayout(layout);
    post({ type: 'setDiffLayout', layout });
  };
  const pinEntireFile = (pinned: boolean) => {
    setEntireFilePinned(pinned);
    post({ type: 'pinEntireFile', pinned });
  };

  const changeCollapseMerges = (collapse: boolean) => {
    setCollapseMerges(collapse);
    post({ type: 'setCollapseMerges', collapse });
  };

  const changeSolo = (next: boolean) => {
    setSolo(next);
    postTab({ type: 'setSolo', solo: next });
  };

  const changeBookmarks = (next: readonly Bookmark[]) => {
    setBookmarks(next);
    postTab({ type: 'setBookmarks', bookmarks: next });
  };

  const isBookmark = (bookmark: Bookmark) => hasRef(bookmarks, bookmark);
  const toggle = (bookmark: Bookmark) =>
    changeBookmarks(toggleBookmark(bookmarks, bookmark));
  const bookmarkItem = (bookmark: Bookmark): ContextMenuItem => ({
    label: isBookmark(bookmark) ? 'Remove bookmark' : 'Add bookmark',
    onClick: () => toggle(bookmark),
  });
  const commitBookmarkItem = (commitHash: string): ContextMenuItem => ({
    label: 'Bookmark',
    submenu: bookmarkOptions(commitHash, refs).map((option) => ({
      label: option.label,
      checked: isBookmark(option.bookmark),
      onClick: () => toggle(option.bookmark),
    })),
  });

  const checkout = (target: CheckoutTarget) =>
    postTab({ type: 'checkout', target });

  const menuItems = (target: MenuTarget): ContextMenuItem[] => {
    const head = repository?.head;
    if (target.kind === 'commit') {
      return [
        {
          label: 'Checkout',
          submenu: checkoutOptions(target.hash, refs, head, detached).map(
            (option) => ({
              label: option.label,
              disabled: option.disabled,
              onClick: () => checkout(option.target),
            }),
          ),
        },
        { separator: true },
        commitBookmarkItem(target.hash),
      ];
    }
    const { ref } = target;
    const option =
      ref.kind === 'commit'
        ? checkoutCommit(ref.name, detached)
        : checkoutRef(ref, refs, head, detached);
    return [
      {
        label: 'Checkout',
        disabled: option.disabled,
        onClick: () => checkout(option.target),
      },
      { separator: true },
      bookmarkItem(target.ref),
    ];
  };

  const openRepository = (event: React.MouseEvent) => {
    if (recent.length === 0) {
      post({ type: 'browseRepositories' });
      return;
    }
    const button = event.currentTarget.getBoundingClientRect();
    setMenu({
      x: button.left,
      y: button.bottom,
      items: repositoryMenuItems(
        recent,
        (root) => post({ type: 'openRepository', root }),
        () => post({ type: 'browseRepositories' }),
      ),
    });
  };

  const openMenu = (event: React.MouseEvent, target: MenuTarget) => {
    event.stopPropagation();
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, items: menuItems(target) });
  };

  return (
    <OpenContextMenu.Provider value={openMenu}>
      <CheckedOutBranch.Provider value={repository?.head}>
        <DetachedHead.Provider value={detached}>
          <div className="app">
            <TitleBar title={windowTitle(activeTab, name)} />
            <TabBar
              tabs={tabs ?? []}
              active={activeTab}
              onSelect={(root) => post({ type: 'selectTab', root })}
              onPreload={(root) => post({ type: 'preloadTab', root })}
              onClose={(root) => post({ type: 'closeTab', root })}
              onAdd={openRepository}
              onSort={() => post({ type: 'sortTabs' })}
              onOpenSettings={() => post({ type: 'openSettings' })}
              onOpenDefaultSettings={() =>
                post({ type: 'openDefaultSettings' })
              }
              onLog={log}
            />
            {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
            <Notices notices={notices} onDismiss={dismissNotice} />
            {tabs === undefined ? null : tabs.length === 0 ? (
              <div className="empty-state">
                No repository is open. Use + to open one.
              </div>
            ) : (
              <ColumnResizingProvider value={resizing}>
                <div
                  className={columnsClass(commitsShown, layoutSelection)}
                  ref={columnsContainer}
                  style={{ gridTemplateColumns: columnsTemplate }}
                  data-active-column={activeColumn}
                  onFocus={(event) => {
                    const column = columnOf(
                      event.target instanceof Element ? event.target : null,
                    );
                    if (column) {
                      setActiveColumn(column);
                    }
                  }}
                  onKeyDown={(event) => {
                    const target =
                      event.target instanceof HTMLElement ? event.target : null;
                    const forwarded = forwardedColumn(columnOf(target), event);
                    if (forwarded) {
                      event.preventDefault();
                      focusColumn(forwarded)?.dispatchEvent(
                        new KeyboardEvent('keydown', {
                          key: event.key,
                          code: event.code,
                          bubbles: true,
                        }),
                      );
                      return;
                    }
                    const step = columnStep({
                      key: event.key,
                      ctrlKey: event.ctrlKey,
                      metaKey: event.metaKey,
                      altKey: event.altKey,
                      shiftKey: event.shiftKey,
                      defaultPrevented: event.defaultPrevented,
                      target,
                    });
                    if (step === undefined) {
                      return;
                    }
                    if (event.key === 'Tab') {
                      event.preventDefault();
                    }
                    const next = adjacentColumn(
                      shownColumns(commitsShown, layoutSelection),
                      columnOf(target) ?? activeColumn,
                      step,
                    );
                    if (next) {
                      event.preventDefault();
                      focusColumn(next);
                    }
                  }}
                >
                  <Commits
                    history={history}
                    opening={opening}
                    scrollTarget={scrollTarget}
                    onScrolled={onScrolled}
                    onLoad={loadCommits}
                    workingTree={workingTree}
                    refsByCommit={refsByCommit}
                    selected={hash}
                    onSelect={selectCommit}
                    onCompare={compareCommit}
                    onToggleMerge={(merge) =>
                      postTab({ type: 'toggleMerge', hash: merge })
                    }
                    collapseMerges={collapseMerges}
                    onCollapseMerges={changeCollapseMerges}
                    solo={solo}
                    headCommit={repository?.headCommit}
                    focusKey={activeTab}
                    error={listError(error, layoutSelection)}
                    applyingSolo={applyingSolo}
                    onSolo={changeSolo}
                    navigation={
                      <NavButtons
                        back={back}
                        forward={forward}
                        onNavigate={navigate}
                        fetching={fetching}
                        onFetch={() => postTab({ type: 'fetch' })}
                        autoFetch={autoFetch}
                        autoFetchMinutes={autoFetchMinutes}
                        onAutoFetch={(on) => {
                          setAutoFetch(on);
                          post({ type: 'setAutoFetch', on });
                        }}
                      />
                    }
                    search={
                      <AddressBar
                        root={activeTab}
                        bookmarks={bookmarks}
                        repository={repository}
                        hashLookup={hashLookup}
                        onLookupHash={lookupHash}
                        commitSearch={commitSearch}
                        onSearchCommits={searchCommits}
                        onJump={jump}
                      />
                    }
                  />
                  <Files
                    title={filesTitle(hash)}
                    noChanges={noChangesText(hash)}
                    showAll={showAllFiles}
                    onShowAll={changeShowAllFiles}
                    closedFolders={closedFolders}
                    onToggleClosedFolder={toggleClosedFolder}
                    files={files}
                    loading={filesLoading || opening}
                    tree={commitTree}
                    openedFolders={openedFolders}
                    onToggleOpenFolder={toggleOpenFolder}
                    onReplaceFolders={(shown) =>
                      setFolders(replaceFolders(folderView, shown))
                    }
                    selected={path}
                    onSelect={selectFile}
                    view={folderView}
                  />
                  <Diff
                    selection={diffSelection(activeTab, hash, path)}
                    path={path}
                    loading={patchLoading || opening}
                    largeFiles={largeFiles}
                    onLoadFile={loadFileDiff}
                    texts={texts}
                    onLoadTexts={loadTexts}
                    files={files}
                    patch={patch}
                    diffs={diffs}
                    fileContent={fileContent}
                    error={error}
                    sideBySide={diffLayout === 'sideBySide'}
                    wordWrap={wordWrap}
                    changeMarks={
                      path !== undefined && (entireFilePinned || entireFile)
                    }
                    options={
                      <DiffOptions
                        entire={entireFile}
                        pinned={entireFilePinned}
                        canShow={path !== undefined}
                        onEntire={showEntireFile}
                        onPin={pinEntireFile}
                        ignoreWhitespace={ignoreWhitespace}
                        onIgnoreWhitespace={changeIgnoreWhitespace}
                        wordWrap={wordWrap}
                        onWordWrap={changeWordWrap}
                        layout={diffLayout}
                        onLayout={changeDiffLayout}
                      />
                    }
                  />
                </div>
              </ColumnResizingProvider>
            )}
          </div>
        </DetachedHead.Provider>
      </CheckedOutBranch.Provider>
    </OpenContextMenu.Provider>
  );
}
