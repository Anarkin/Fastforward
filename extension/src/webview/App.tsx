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
  workingTreeHash,
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
import { CheckedOutBranch, DetachedHead, BubbleBar } from './bubbles';
import { checkoutOptions, checkoutRef } from './checkout';
import { ColumnResizingProvider, useColumnWidths } from './columns';
import type { CardCommit } from './commitCard';
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
import { NavBar } from './navBar';
import { TabBar } from './tabBar';
import {
  foldersOfTab,
  openFolders,
  toggleFolder,
  type FoldersByTab,
  type TabFolders,
} from './tabFolders';
import { emptyTabView, reduceTabView } from './tabView';
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
    fileContent,
    largeFiles,
    tree,
    fetching,
    back,
    forward,
    hashLookup,
    error,
  } = tab;
  // Sublime Merge's setting, on by default
  const [collapseMerges, setCollapseMerges] = useState(true);
  const [filesMode, setFilesMode] = useState<FilesMode>('changes');
  const [changesView, setChangesView] = useState<ChangesView>('list');
  // Open and closed folders of each tab, kept while moving between commits
  // and tabs
  const [folders, setFolders] = useState<FoldersByTab>(new Map());
  const { open: openedFolders, closed: closedFolders } = foldersOfTab(
    folders,
    activeTab,
  );
  // Refs pinned to the bookmarks row, saved per repository
  const [bookmarks, setBookmarks] = useState<readonly Bookmark[]>([]);
  const [menu, setMenu] = useState<OpenMenu>();
  const closeMenu = useCallback(() => setMenu(undefined), []);
  const saveColumnWidths = useCallback(
    (widths: readonly number[]) => post({ type: 'setColumnWidths', widths }),
    [post],
  );
  // The commit list, which C hides for more room for the files and the diff;
  // not saved, so it is back whenever the view opens
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
          setFilesMode(message.filesMode);
          setChangesView(message.changesView);
          break;
        case 'tabs':
          // Everything shown for the previous tab is forgotten
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

  // Shows a commit as selected while its files and diff load
  const showCommit = (next: string | undefined) =>
    dispatch({ type: 'showCommit', hash: next });

  const log = useCallback(
    (message: string) => post({ type: 'log', level: 'info', message }),
    [post],
  );

  // Messages about the tab say which one it is, as the extension may have
  // opened another by the time it handles them
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

  const commit = history?.find(hash);
  // The commit HEAD points at when no branch is checked out
  const detached =
    repository && !repository.head ? repository.headCommit : undefined;
  // The selected commit, for the address bar's peek
  const card: CardCommit | undefined =
    hash === workingTreeHash || !commit
      ? undefined
      : {
          ...commit,
          refs: refsByCommit.get(commit.hash) ?? [],
          detachedHead: detached === commit.hash,
        };
  // A tab whose history hasn't arrived yet, which every column shows
  // placeholders for, as it selects what is checked out once it has
  const opening = activeTab !== undefined && history === undefined && !error;

  // Selecting the selected commit again, or "No changes", clears the selection
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

  // The mouse's back and forward buttons, like in a browser
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
  // Scrolls to a location's commit, which the extension finds in the history
  const jump = (target: string | undefined) => {
    if (target) {
      postTab({ type: 'jump', hash: target });
    }
  };
  const loadFileDiff = useCallback(
    (file: string) => {
      if (hash) {
        postTab({ type: 'loadFileDiff', hash, path: file });
      }
    },
    [hash, postTab],
  );

  const selectFile = (next: string | undefined) => {
    if (!hash) {
      return;
    }
    dispatch({ type: 'showFile', path: next });
    postTab({ type: 'selectFile', hash, path: next });
  };

  // The Files view needs every file of the repository at the selected commit;
  // asked once per tab and commit, not again when a tree of another commit
  // arrives while this one is on its way
  const requestedTree = useRef<string>(undefined);
  useEffect(() => {
    if (filesMode !== 'files' || !hash || tree?.hash === hash) {
      return;
    }
    const request = JSON.stringify([activeTab, hash]);
    if (requestedTree.current !== request) {
      requestedTree.current = request;
      postTab({ type: 'loadTree', hash });
    }
  }, [filesMode, hash, tree, activeTab, postTab]);

  // The selected file's folders open, so it is visible in the Files view
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
  // A commit's refs and the commit itself, each checked when it is a bookmark
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

  // The items of the menu for what was right-clicked
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
    // Only the innermost target, like a bubble inside a commit row
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
            {tabs.length > 0 && (
              <NavBar
                root={activeTab}
                back={back}
                forward={forward}
                onNavigate={navigate}
                fetching={fetching}
                onFetch={() => postTab({ type: 'fetch' })}
                address={{
                  hash: hash === workingTreeHash ? undefined : hash,
                  subject:
                    hash === workingTreeHash
                      ? 'Uncommitted changes'
                      : commit?.subject,
                  commit: card,
                }}
                repository={repository}
                selected={hash}
                hashLookup={hashLookup}
                onLookupHash={lookupHash}
                onJump={jump}
              />
            )}
            {tabs.length > 0 && (
              <BubbleBar
                root={activeTab}
                repository={repository}
                bookmarks={bookmarks}
                onJump={jump}
              />
            )}
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
