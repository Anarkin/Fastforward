import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  commitPageSize,
  type ChangesView,
  type Direction,
  type CheckoutTarget,
  type FilesMode,
  type RefInfo,
  type TabInfo,
  type TabMessage,
  type ToExtension,
  type ToWebview,
  type Bookmark,
} from '../shared/protocol';
import { CheckedOutBranch, DetachedHead } from './bubbles';
import { checkoutOptions, checkoutRef } from './checkout';
import { ColumnResizingProvider, useColumnWidths } from './columns';
import { Commits } from './commitList';
import { useShortcuts } from './shortcuts';
import {
  ContextMenu,
  OpenContextMenu,
  type ContextMenuItem,
  type MenuTarget,
  type OpenMenu,
} from './contextMenu';
import { Diff } from './diffColumn';
import { Files } from './filesColumn';
import { foldersOf } from './fileTree';
import { hasRef, sameRef } from '../shared/refNames';
import { AddressBar, NavButtons } from './navBar';
import { TabBar } from './tabBar';
import {
  foldersOfTab,
  openFolders,
  toggleFolder,
  type FoldersByTab,
  type TabFolders,
} from './tabFolders';
import { emptyTabView, reduceTabView, treeToLoad } from './tabView';
import { bookmarkOptions } from './bookmarks';

interface Props {
  post: (message: ToExtension) => void;
}

export function App({ post }: Props) {
  const [tabs, setTabs] = useState<readonly TabInfo[]>([]);
  const [activeTab, setActiveTab] = useState<string>();
  const activeTabRef = useRef<string>(undefined);
  const [tab, dispatch] = useReducer(reduceTabView, emptyTabView);
  const {
    repository,
    history,
    scrollTarget,
    workingTree,
    hash,
    files,
    filesLoading,
    patchLoading,
    path,
    patch,
    diffs,
    fileContent,
    largeFiles,
    tree,
    fetching,
    back,
    forward,
    hashLookup,
    error,
  } = tab;
  const [collapseMerges, setCollapseMerges] = useState(true);
  const [solo, setSolo] = useState(false);
  const [filesMode, setFilesMode] = useState<FilesMode>('changes');
  const [changesView, setChangesView] = useState<ChangesView>('tree');
  const [folders, setFolders] = useState<FoldersByTab>(new Map());
  const { open: openedFolders, closed: closedFolders } = foldersOfTab(
    folders,
    activeTab,
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

  useEffect(() => {
    const onMessage = (event: MessageEvent<ToWebview>) => {
      const message = event.data;
      switch (message.type) {
        case 'layout':
          loadColumnWidths(message.columnWidths);
          setCollapseMerges(message.collapseMerges);
          setSolo(message.solo);
          setFilesMode(message.filesMode);
          setChangesView(message.changesView);
          break;
        case 'tabs':
          if (activeTabRef.current !== message.active) {
            dispatch({ type: 'clear' });
          }
          activeTabRef.current = message.active;
          setTabs(message.tabs);
          setActiveTab(message.active);
          break;
        case 'bookmarks':
          setBookmarks(message.bookmarks);
          break;
        default:
          dispatch(message);
      }
    };
    window.addEventListener('message', onMessage);
    post({ type: 'ready' });
    // The modal focuses the webview before the page has loaded, so the page
    // takes the focus itself, for the keyboard shortcuts to work without a
    // click first
    window.focus();
    return () => window.removeEventListener('message', onMessage);
  }, [post, loadColumnWidths]);

  const showCommit = (next: string | undefined) =>
    dispatch({ type: 'showCommit', hash: next });

  const log = useCallback(
    (message: string) => post({ type: 'log', level: 'info', message }),
    [post],
  );

  const postTab = useCallback(
    (message: TabMessage) => {
      const root = activeTabRef.current;
      if (root !== undefined) {
        post({ ...message, root });
      }
    },
    [post],
  );

  const onScrolled = useCallback(
    (top: string, offset: number) =>
      postTab({ type: 'scrolled', hash: top, offset }),
    [postTab],
  );

  const loadCommits = useCallback(
    (start: number, generation: number) =>
      postTab({
        type: 'loadCommits',
        generation,
        start,
        count: commitPageSize,
      }),
    [postTab],
  );

  const refsByCommit = useMemo(() => {
    const map = new Map<string, RefInfo[]>();
    for (const info of repository?.refs ?? []) {
      map.set(info.commit, [...(map.get(info.commit) ?? []), info]);
    }
    return map;
  }, [repository]);

  const detached =
    repository && !repository.head ? repository.headCommit : undefined;
  const opening = activeTab !== undefined && history === undefined && !error;

  const selectCommit = (next: string | undefined, replace = false) => {
    const target = next === hash ? undefined : next;
    showCommit(target);
    postTab({ type: 'selectCommit', hash: target, replace });
  };
  const lookupHash = useCallback(
    (query: string) => postTab({ type: 'lookupHash', query }),
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

  const selectFile = (next: string | undefined) => {
    if (!hash) {
      return;
    }
    dispatch({ type: 'showFile', path: next });
    postTab({ type: 'selectFile', hash, path: next });
  };

  const treeNeeded = filesMode === 'files' ? treeToLoad(tab) : undefined;
  useEffect(() => {
    if (treeNeeded) {
      dispatch({ type: 'requestTree', hash: treeNeeded });
      postTab({ type: 'loadTree', hash: treeNeeded });
    }
  }, [treeNeeded, postTab]);

  useEffect(() => {
    if (filesMode !== 'files' || path === undefined) {
      return;
    }
    setFolders((all) => openFolders(all, activeTab, foldersOf(path)));
  }, [filesMode, path, activeTab]);

  const toggleFolderOf = (kind: keyof TabFolders) => (folder: string) =>
    setFolders((all) => toggleFolder(all, activeTab, kind, folder));
  const toggleOpenFolder = toggleFolderOf('open');
  const toggleClosedFolder = toggleFolderOf('closed');

  const changeFilesMode = (mode: FilesMode) => {
    setFilesMode(mode);
    post({ type: 'setFilesMode', mode });
  };

  const changeChangesView = (view: ChangesView) => {
    setChangesView(view);
    post({ type: 'setChangesView', view });
  };

  const changeBookmarks = (next: readonly Bookmark[]) => {
    setBookmarks(next);
    postTab({ type: 'setBookmarks', bookmarks: next });
  };

  const isBookmark = (bookmark: Bookmark) => hasRef(bookmarks, bookmark);
  const toggleBookmark = (bookmark: Bookmark) =>
    changeBookmarks(
      isBookmark(bookmark)
        ? bookmarks.filter((other) => !sameRef(other, bookmark))
        : [...bookmarks, bookmark],
    );
  const bookmarkItem = (bookmark: Bookmark): ContextMenuItem => ({
    label: isBookmark(bookmark) ? 'Remove bookmark' : 'Add bookmark',
    onClick: () => toggleBookmark(bookmark),
  });
  const commitBookmarkItem = (commitHash: string): ContextMenuItem => ({
    label: 'Bookmark',
    submenu: bookmarkOptions(commitHash, repository?.refs ?? []).map(
      (option) => ({
        label: option.label,
        checked: isBookmark(option.bookmark),
        onClick: () => toggleBookmark(option.bookmark),
      }),
    ),
  });

  const checkout = (target: CheckoutTarget) =>
    postTab({ type: 'checkout', target });

  const menuItems = (target: MenuTarget): ContextMenuItem[] => {
    const refs = repository?.refs ?? [];
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
        ? {
            target: { kind: 'commit' as const, hash: ref.name },
            disabled: ref.name === detached,
          }
        : checkoutRef(ref, refs, head);
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

  const openMenu = (event: React.MouseEvent, target: MenuTarget) => {
    event.stopPropagation();
    const items = menuItems(target);
    if (items.length > 0) {
      event.preventDefault();
      setMenu({ x: event.clientX, y: event.clientY, items });
    }
  };

  return (
    <OpenContextMenu.Provider value={openMenu}>
      <CheckedOutBranch.Provider value={repository?.head}>
        <DetachedHead.Provider value={detached}>
          <div className="app">
            <TabBar
              tabs={tabs}
              active={activeTab}
              onSelect={(root) => post({ type: 'selectTab', root })}
              onPreload={(root) => post({ type: 'preloadTab', root })}
              onClose={(root) => post({ type: 'closeTab', root })}
              onAdd={() => post({ type: 'addTab' })}
              onSort={() => post({ type: 'sortTabs' })}
              onLog={log}
            />
            {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
            {tabs.length === 0 ? (
              <div className="empty-state">
                No repository is open. Use + to open one.
              </div>
            ) : (
              <ColumnResizingProvider value={resizing}>
                <div
                  className={`columns ${commitsShown ? '' : 'commits-hidden'}`}
                  ref={columnsContainer}
                  style={{ gridTemplateColumns: columnsTemplate }}
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
                    onToggleMerge={(merge) =>
                      postTab({ type: 'toggleMerge', hash: merge })
                    }
                    collapseMerges={collapseMerges}
                    onCollapseMerges={(collapse) => {
                      setCollapseMerges(collapse);
                      post({ type: 'setCollapseMerges', collapse });
                    }}
                    solo={solo}
                    onSolo={(next) => {
                      setSolo(next);
                      post({ type: 'setSolo', solo: next });
                    }}
                    navigation={
                      <NavButtons
                        back={back}
                        forward={forward}
                        onNavigate={navigate}
                        fetching={fetching}
                        onFetch={() => postTab({ type: 'fetch' })}
                      />
                    }
                    search={
                      <AddressBar
                        root={activeTab}
                        placeholder="Search…"
                        bookmarks={bookmarks}
                        repository={repository}
                        selected={hash}
                        hashLookup={hashLookup}
                        onLookupHash={lookupHash}
                        onJump={jump}
                      />
                    }
                  />
                  <Files
                    mode={filesMode}
                    onMode={changeFilesMode}
                    changesView={changesView}
                    onChangesView={changeChangesView}
                    closedFolders={closedFolders}
                    onToggleClosedFolder={toggleClosedFolder}
                    files={files}
                    loading={filesLoading || opening}
                    treeLoading={hash !== undefined && tree?.hash !== hash}
                    tree={
                      hash !== undefined && tree?.hash === hash
                        ? tree.paths
                        : undefined
                    }
                    openFolders={openedFolders}
                    onToggleFolder={toggleOpenFolder}
                    selected={path}
                    onSelect={selectFile}
                  />
                  <Diff
                    selection={`${hash ?? ''}:${path ?? ''}`}
                    path={path}
                    loading={patchLoading || opening}
                    largeFiles={largeFiles}
                    onLoadFile={loadFileDiff}
                    files={files}
                    patch={patch}
                    diffs={diffs}
                    fileContent={
                      fileContent?.path === path ? fileContent : undefined
                    }
                    error={error}
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
