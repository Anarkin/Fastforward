import { gitKeymap } from '../shared/keymap';
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
  type RepositoryInfo,
  type TabMessage,
  type GitToHost,
  type GitToWebview,
  type GitToWebviewOf,
  type Bookmark,
  type ChangeArea,
  type DiffLayout,
  type LastFetch,
  type TextRequest,
  type WorktreeInfo,
} from '../shared/protocol';
import {
  BookmarkedCommits,
  BranchActions,
  CheckedOutBranch,
  DetachedHead,
  HideDimmedButtons,
  OtherBranchActions,
  TagActions,
} from './bubbles';
import { tagsOnRemote } from './tagPushes';
import { trackingOf } from './tracking';
import { areaKey } from './changesTree';
import { checkoutCommit, checkoutOptions, checkoutRef } from './checkout';
import {
  columnsClass,
  showsDiff,
  listError,
  shownSelection,
  ColumnResizingProvider,
  useColumnWidths,
} from './columns';
import {
  columnOf,
  columnOrder,
  columnStep,
  forwardedColumn,
  keyboardDropped,
  shownColumns,
  type ColumnName,
} from './activeColumn';
import { columnFocusAttribute } from '../../../ui/columnFocus';
import { Commits, settling } from './commitList';
import { clicked } from '../../../shell/shared/keymap';
import { useBinding } from '../../../ui/shortcuts';
import { type ContextMenuItem, type OpenMenu } from '../../../ui/contextMenu';
import { OpenContextMenu, type MenuEvent, type MenuTarget } from './menus';
import { Diff, DiffOptions, diffSelection } from './diffColumn';
import { Files, filesTitle, listsNothing, noChangesText } from './filesColumn';
import { foldersOf } from './fileTree';
import { compareWith } from '../shared/comparisons';
import { bookmarkedCommits, hasRef } from '../shared/refNames';
import { strings } from '../../../shared/strings';
import { AddressBar, NavButtons } from './navBar';
import { SearchButton } from '../../../ui/search';
import { WorktreeBar } from './worktreeBar';
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
import {
  changesShown,
  emptyTabView,
  reduceTabView,
  treeOf,
  treeToLoad,
} from './tabView';
import { bookmarkOptions, toggleBookmark } from './bookmarks';
import { repositoryMenuItems } from './repositoryMenu';
import { ConfirmPopup } from '../../../shell/page/confirmPopup';
import { ClonePopup, type ChosenFolder, type CloneTarget } from './clonePopup';
import type { CloneAsk, CloneView } from '../shared/clone';

export interface GitToolProps {
  active: boolean;
  post: (message: GitToHost) => void;
  listen: (handler: (message: GitToWebview) => void) => () => void;
  showMenu: (menu: OpenMenu) => void;
  closeMenu: () => void;
  onNewTabItems: (items: readonly ContextMenuItem[]) => void;
  onTitle: (title: string | undefined) => void;
}

export function GitTool({
  active,
  post: postToHost,
  listen,
  showMenu,
  closeMenu,
  onNewTabItems,
  onTitle,
}: GitToolProps) {
  const outbox = useMemo(() => settling(postToHost), [postToHost]);
  const post = outbox.send;
  const [worktrees, setWorktrees] = useState<readonly WorktreeInfo[]>();
  const [recent, setRecent] = useState<readonly RepositoryInfo[]>([]);
  const [initAsked, setInitAsked] = useState<GitToWebviewOf<'confirmInit'>>();
  const [cloneView, setCloneView] = useState<CloneView>();
  const [cloneForm, setCloneForm] = useState(0);
  const [cloneFolder, setCloneFolder] = useState<ChosenFolder>();
  const [cloneTarget, setCloneTarget] = useState<CloneTarget>();
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
    staged,
    filesLoading,
    patchLoading,
    path,
    area,
    entireFile,
    patch,
    leftOut,
    whitespaceOnly,
    diffs,
    refreshes,
    fileContent,
    largeFiles,
    texts,
    fetching,
    pulling,
    pushing,
    pushingTag,
    pullingBranch,
    pushingBranch,
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
  const [showWhitespace, setShowWhitespace] = useState(false);
  const [autoFetch, setAutoFetch] = useState(false);
  const [autoFetchMinutes, setAutoFetchMinutes] = useState(0);
  const [hideDimmed, setHideDimmed] = useState(false);
  const [diffLayout, setDiffLayout] = useState<DiffLayout>('sideBySide');
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
  const [lastFetch, setLastFetch] = useState<LastFetch>({});
  useEffect(
    () =>
      onNewTabItems(
        repositoryMenuItems(recent, {
          onOpen: (root) => post({ type: 'openRepository', root }),
          onBrowse: () => post({ type: 'browseRepositories' }),
          onClone: () => post({ type: 'openClone' }),
          onInit: () => post({ type: 'initRepository' }),
          onRemove: (root) => {
            setRecent((shown) => shown.filter((other) => other.root !== root));
            post({ type: 'forgetRecent', root });
          },
        }),
      ),
    [recent, post, onNewTabItems],
  );
  const checkCloneTarget = useCallback(
    (folder: string, name: string) =>
      post({ type: 'checkCloneTarget', folder, name }),
    [post],
  );
  const closeClone = useCallback(() => {
    setCloneView(undefined);
    post({ type: 'closeClone' });
  }, [post]);
  const saveColumnWidths = useCallback(
    (widths: readonly number[]) => post({ type: 'setColumnWidths', widths }),
    [post],
  );
  const [commitsShown, setCommitsShown] = useState(true);
  const [searching, setSearching] = useState(false);
  useBinding(
    gitKeymap.commits,
    () => setCommitsShown((shown) => !shown),
    active,
  );
  const commitColumnShown = commitsShown || searching;
  const hiddenColumns = useMemo(
    () => [!commitColumnShown, false],
    [commitColumnShown],
  );
  const {
    container: columnsContainer,
    template: columnsTemplate,
    load: loadColumnWidths,
    resizing,
  } = useColumnWidths(saveColumnWidths, hiddenColumns);
  const [activeColumn, setActiveColumn] = useState<ColumnName>('commits');
  const [searchAsks, setSearchAsks] = useState<Record<ColumnName, number>>({
    commits: 0,
    files: 0,
    diff: 0,
  });
  const [fileFilters, setFileFilters] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  const fileFilter =
    activeTab === undefined ? undefined : fileFilters.get(activeTab);
  const changeFileFilter = (filter: string | undefined) => {
    if (activeTab === undefined) {
      return;
    }
    setFileFilters((all) => {
      const next = new Map(all);
      if (filter === undefined) {
        next.delete(activeTab);
      } else {
        next.set(activeTab, filter);
      }
      return next;
    });
  };
  useBinding(
    gitKeymap.find,
    () => {
      setSearchAsks((asks) => ({
        ...asks,
        [activeColumn]: asks[activeColumn] + 1,
      }));
      if (activeColumn === 'commits') {
        setSearching(true);
      } else if (activeColumn === 'files' && fileFilter === undefined) {
        changeFileFilter('');
      }
    },
    active,
  );
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
    const onFocusOut = ({ target }: FocusEvent) => {
      if (
        target instanceof Element &&
        columnsContainer.current?.contains(target)
      ) {
        queueMicrotask(() => {
          if (keyboardDropped(target, document.activeElement, document.body)) {
            focusColumn(activeColumn);
          }
        });
      }
    };
    document.addEventListener('focusout', onFocusOut);
    return () => document.removeEventListener('focusout', onFocusOut);
  }, [columnsContainer, focusColumn, activeColumn]);

  useEffect(() => {
    const onMessage = (message: GitToWebview) => {
      switch (message.type) {
        case 'layout':
          loadColumnWidths(message.columnWidths, message.defaultColumnWidths);
          setCollapseMerges(message.collapseMerges);
          setEntireFilePinned(message.entireFilePinned);
          setIgnoreWhitespace(message.ignoreWhitespace);
          setWordWrap(message.wordWrap);
          setShowWhitespace(message.showWhitespace);
          setDiffLayout(message.diffLayout);
          setShowAllFiles(message.showAllFiles);
          setAutoFetch(message.autoFetch);
          setAutoFetchMinutes(message.autoFetchMinutes);
          setHideDimmed(message.hideDimmedButtons);
          break;
        case 'solo':
          setSolo(message.solo);
          break;
        case 'worktrees':
          setWorktrees(message.worktrees);
          dispatch(message);
          break;
        case 'recent':
          setRecent(message.recent);
          break;
        case 'confirmInit':
          setInitAsked(message);
          break;
        case 'clone':
          setCloneView(message.view);
          if (message.view?.kind === 'form') {
            setCloneForm((shown) => shown + 1);
            setCloneFolder(undefined);
          }
          break;
        case 'cloneFolder':
          setCloneFolder({ folder: message.folder });
          break;
        case 'cloneTarget':
          setCloneTarget(message);
          break;
        case 'bookmarks':
          setBookmarks(message.bookmarks);
          break;
        case 'lastFetch':
          setLastFetch(message);
          break;
        default:
          dispatch(message);
      }
    };
    return listen(onMessage);
  }, [listen, loadColumnWidths]);

  useEffect(() => onTitle(activeTab), [activeTab, onTitle]);
  const menuWorktree = useRef(activeTab);
  useEffect(() => {
    if (menuWorktree.current !== activeTab) {
      menuWorktree.current = activeTab;
      closeMenu();
    }
  }, [activeTab, closeMenu]);

  const postTab = useCallback(
    (message: TabMessage) => {
      if (activeTab !== undefined) {
        post({ ...message, root: activeTab });
      }
    },
    [post, activeTab],
  );
  const passTab = useCallback(
    (message: TabMessage) => {
      if (activeTab !== undefined) {
        outbox.pass({ ...message, root: activeTab });
      }
    },
    [outbox, activeTab],
  );

  const onScrolled = useCallback(
    (top: string, offset: number, report: number) =>
      passTab({ type: 'scrolled', hash: top, offset, report }),
    [passTab],
  );

  const loadCommits = useCallback(
    (start: number, count: number, generation: number) =>
      passTab({ type: 'loadCommits', generation, start, count }),
    [passTab],
  );

  const refs = repository?.refs ?? [];
  const branchActions = useMemo(
    () => ({
      pulling,
      pushing,
      onPull: () => postTab({ type: 'pull' }),
      onPush: () => postTab({ type: 'push' }),
      tracking: trackingOf(repository?.refs ?? [], repository?.head),
    }),
    [pulling, pushing, postTab, repository],
  );
  const otherBranchActions = useMemo(
    () => ({
      pulling: pullingBranch,
      pushing: pushingBranch,
      onPull: (branch: string) => postTab({ type: 'pullBranch', name: branch }),
      onPush: (branch: string) => postTab({ type: 'pushBranch', name: branch }),
      elsewhere: new Set(
        (worktrees ?? [])
          .filter((worktree) => worktree.root !== activeTab)
          .map((worktree) => worktree.name),
      ),
    }),
    [pullingBranch, pushingBranch, postTab, worktrees, activeTab],
  );
  const tagRemote = repository?.tagRemote;
  const repositoryRefs = repository?.refs;
  const tagActions = useMemo(
    () => ({
      remote: tagRemote,
      onRemote:
        tagRemote === undefined
          ? new Set<string>()
          : tagsOnRemote(repositoryRefs ?? [], tagRemote),
      pushing: pushingTag,
      onPush: (tag: string) => postTab({ type: 'pushTag', name: tag }),
    }),
    [tagRemote, repositoryRefs, pushingTag, postTab],
  );
  const refsByCommit = useMemo(
    () => Map.groupBy(repository?.refs ?? [], (info) => info.commit),
    [repository],
  );
  const stashes = useMemo(
    () => new Set(repository?.stashes.map((stash) => stash.commit)),
    [repository],
  );

  const detached =
    repository && !repository.head ? repository.headCommit : undefined;
  const bookmarked = useMemo(() => bookmarkedCommits(bookmarks), [bookmarks]);
  const opening = activeTab !== undefined && history === undefined && !error;
  const layoutSelection = shownSelection(hash, workingTree);
  const commitTree = treeOf(tab);
  const diffShown = showsDiff(
    error,
    listsNothing({
      files,
      staged,
      allPaths: showAllFiles ? commitTree : undefined,
      loading: filesLoading || opening,
    }),
  );
  const activeShown = shownColumns(
    commitColumnShown,
    layoutSelection,
    diffShown,
  ).includes(activeColumn);
  useEffect(() => {
    if (!activeShown) {
      const [first] = shownColumns(
        commitColumnShown,
        layoutSelection,
        diffShown,
      );
      if (first) {
        focusColumn(first);
      }
    }
  }, [activeShown, commitColumnShown, layoutSelection, diffShown, focusColumn]);

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
    (query: string) => {
      postTab({ type: 'searchCommits', query });
      return () => postTab({ type: 'stopCommitSearch' });
    },
    [postTab],
  );
  const navigate = useCallback(
    (direction: Direction, steps: number) =>
      postTab({ type: 'navigate', direction, steps }),
    [postTab],
  );

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const onMouseUp = (event: MouseEvent) => {
      const direction = clicked(gitKeymap.navigate, event);
      if (direction) {
        event.preventDefault();
        navigate(direction, 1);
      }
    };
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, [active, navigate]);
  useBinding(gitKeymap.navigate, (direction) => navigate(direction, 1), active);
  const jump = (target: string | undefined) => {
    if (target) {
      postTab({ type: 'jump', hash: target });
    }
  };
  useBinding(gitKeymap.head, () => jump(repository?.headCommit), active);
  useBinding(
    gitKeymap.upstream,
    () => postTab({ type: 'showUpstream' }),
    active,
  );
  useBinding(gitKeymap.parent, () => postTab({ type: 'showParent' }), active);
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

  const imageOrigin = useMemo(
    () =>
      activeTab === undefined || hash === undefined
        ? undefined
        : {
            root: activeTab,
            hash,
            ...(area === undefined ? {} : { area }),
            version: `${diffs}.${refreshes}`,
          },
    [activeTab, hash, area, diffs, refreshes],
  );

  const selectFile = (next: string | undefined, nextArea?: ChangeArea) => {
    if (!hash) {
      return;
    }
    dispatch({ type: 'showFile', path: next, area: nextArea });
    postTab({ type: 'selectFile', hash, path: next, area: nextArea });
  };

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
    setFolders((all) =>
      openFolders(
        all,
        folderView,
        foldersOf(path).map((folder) => areaKey(area, folder)),
      ),
    );
  }, [showAllFiles, path, area, folderView]);

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
  useBinding(gitKeymap.wrap, () => changeWordWrap(!wordWrap), active);
  const changeShowWhitespace = (show: boolean) => {
    setShowWhitespace(show);
    post({ type: 'setShowWhitespace', show });
  };
  useBinding(
    gitKeymap.showWhitespace,
    () => changeShowWhitespace(!showWhitespace),
    active,
  );
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
    label: isBookmark(bookmark)
      ? strings.commits.removeBookmark
      : strings.commits.addBookmark,
    onClick: () => toggle(bookmark),
  });
  const commitBookmarkItem = (commitHash: string): ContextMenuItem => ({
    label: strings.commits.bookmark,
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
          label: strings.commits.checkout,
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
        label: strings.commits.checkout,
        disabled: option.disabled,
        onClick: () => checkout(option.target),
      },
      { separator: true },
      bookmarkItem(target.ref),
    ];
  };

  const openMenu = (event: MenuEvent, target: MenuTarget) => {
    event.stopPropagation();
    event.preventDefault();
    showMenu({
      x: event.clientX,
      y: event.clientY,
      items: menuItems(target),
    });
  };

  const popups = (
    <>
      {cloneView && (
        <ClonePopup
          view={cloneView}
          formKey={cloneForm}
          chosenFolder={cloneFolder}
          checked={cloneTarget}
          onCheck={checkCloneTarget}
          onChooseFolder={(folder) =>
            post({ type: 'chooseCloneFolder', folder })
          }
          onClone={(ask: CloneAsk) => post({ type: 'clone', ...ask })}
          onStop={() => post({ type: 'stopClone' })}
          onClose={closeClone}
        />
      )}
      {initAsked && (
        <ConfirmPopup
          title={strings.confirm.initTitle}
          message={strings.confirm.initInside(
            initAsked.folder,
            initAsked.repository,
          )}
          confirm={strings.confirm.init}
          onConfirm={() => {
            setInitAsked(undefined);
            post({ type: 'initInside', folder: initAsked.folder });
          }}
          onCancel={() => setInitAsked(undefined)}
        />
      )}
    </>
  );

  if (!active) {
    return popups;
  }

  return (
    <OpenContextMenu.Provider value={openMenu}>
      {popups}
      <CheckedOutBranch.Provider value={repository?.head}>
        <BranchActions.Provider value={branchActions}>
          <OtherBranchActions.Provider value={otherBranchActions}>
            <TagActions.Provider value={tagActions}>
              <HideDimmedButtons.Provider value={hideDimmed}>
                <DetachedHead.Provider value={detached}>
                  <BookmarkedCommits.Provider value={bookmarked}>
                    <div className="repository">
                      <WorktreeBar
                        worktrees={worktrees}
                        active={activeTab}
                        onSelect={(root) =>
                          post({ type: 'selectWorktree', root })
                        }
                        onPreload={(root) =>
                          post({ type: 'preloadWorktree', root })
                        }
                      />
                      {
                        <ColumnResizingProvider value={resizing}>
                          <div
                            className={columnsClass(
                              commitColumnShown,
                              layoutSelection,
                              diffShown,
                            )}
                            ref={columnsContainer}
                            style={{ gridTemplateColumns: columnsTemplate }}
                            data-active-column={activeColumn}
                            onFocus={(event) => {
                              const column = columnOf(
                                event.target instanceof Element
                                  ? event.target
                                  : null,
                              );
                              if (column) {
                                setActiveColumn(column);
                              }
                            }}
                            onKeyDown={(event) => {
                              const target =
                                event.target instanceof HTMLElement
                                  ? event.target
                                  : null;
                              const forwarded = forwardedColumn(
                                columnOf(target),
                                event,
                              );
                              if (forwarded) {
                                event.preventDefault();
                                focusColumn(forwarded)?.dispatchEvent(
                                  new KeyboardEvent(
                                    'keydown',
                                    event.nativeEvent,
                                  ),
                                );
                                return;
                              }
                              const step = columnStep(
                                event,
                                shownColumns(
                                  commitColumnShown,
                                  layoutSelection,
                                  diffShown,
                                ),
                                columnOf(target) ?? activeColumn,
                                target?.hasAttribute(columnFocusAttribute) ??
                                  true,
                              );
                              if (step?.preventDefault) {
                                event.preventDefault();
                              }
                              if (step?.next) {
                                focusColumn(step.next);
                              }
                            }}
                          >
                            <Commits
                              history={history}
                              worktree={activeTab}
                              opening={opening}
                              scrollTarget={scrollTarget}
                              onScrolled={onScrolled}
                              onLoad={loadCommits}
                              workingTree={workingTree}
                              refsByCommit={refsByCommit}
                              stashes={stashes}
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
                              searching={searching}
                              error={listError(error, layoutSelection)}
                              applyingSolo={applyingSolo}
                              onSolo={changeSolo}
                              navigation={
                                <NavButtons
                                  back={back}
                                  forward={forward}
                                  onNavigate={navigate}
                                  onHome={
                                    repository?.headCommit === undefined
                                      ? undefined
                                      : () => jump(repository.headCommit)
                                  }
                                  fetching={fetching}
                                  onFetch={() => postTab({ type: 'fetch' })}
                                  autoFetch={autoFetch}
                                  autoFetchMinutes={autoFetchMinutes}
                                  onAutoFetch={(on) => {
                                    setAutoFetch(on);
                                    post({ type: 'setAutoFetch', on });
                                  }}
                                  lastFetch={lastFetch}
                                />
                              }
                              searchButton={
                                <SearchButton
                                  title={strings.actions.search}
                                  onClick={() => setSearching(true)}
                                />
                              }
                              search={
                                <AddressBar
                                  open={searching}
                                  asked={searchAsks.commits}
                                  onOpen={setSearching}
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
                              noChanges={noChangesText(hash, error)}
                              showAll={showAllFiles}
                              onShowAll={changeShowAllFiles}
                              closedFolders={closedFolders}
                              onToggleClosedFolder={toggleClosedFolder}
                              files={files}
                              staged={staged}
                              loading={filesLoading || opening}
                              tree={commitTree}
                              openedFolders={openedFolders}
                              onToggleOpenFolder={toggleOpenFolder}
                              onReplaceFolders={(shown) =>
                                setFolders(replaceFolders(folderView, shown))
                              }
                              selected={path}
                              area={area}
                              onSelect={selectFile}
                              view={folderView}
                              filter={fileFilter}
                              onFilter={changeFileFilter}
                              filterAsked={searchAsks.files}
                            />
                            <Diff
                              selection={diffSelection(
                                activeTab,
                                hash,
                                path,
                                area,
                              )}
                              path={path}
                              loading={patchLoading || opening}
                              largeFiles={largeFiles}
                              onLoadFile={loadFileDiff}
                              texts={texts}
                              onLoadTexts={loadTexts}
                              files={changesShown(tab)}
                              patch={patch}
                              leftOut={leftOut}
                              whitespaceOnly={whitespaceOnly}
                              diffs={diffs}
                              fileContent={fileContent}
                              error={error}
                              sideBySide={diffLayout === 'sideBySide'}
                              wordWrap={wordWrap}
                              showWhitespace={showWhitespace}
                              origin={imageOrigin}
                              findAsked={searchAsks.diff}
                              filter={fileFilter}
                              changeMarks={
                                path !== undefined &&
                                (entireFilePinned || entireFile)
                              }
                              entire={entireFilePinned || entireFile}
                              options={
                                <DiffOptions
                                  entire={entireFile}
                                  pinned={entireFilePinned}
                                  canShow={path !== undefined}
                                  onEntire={showEntireFile}
                                  onPin={pinEntireFile}
                                  showWhitespace={showWhitespace}
                                  onShowWhitespace={changeShowWhitespace}
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
                      }
                    </div>
                  </BookmarkedCommits.Provider>
                </DetachedHead.Provider>
              </HideDimmedButtons.Provider>
            </TagActions.Provider>
          </OtherBranchActions.Provider>
        </BranchActions.Provider>
      </CheckedOutBranch.Provider>
    </OpenContextMenu.Provider>
  );
}
