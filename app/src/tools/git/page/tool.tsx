import { compareKeymap, gitKeymap } from '../shared/keymap';
import { CompareView } from './compareView';
import { useShell, useShellActions } from '../../../shell/page/store';
import {
  ChosenLanguage,
  LanguageButton,
  shownLanguage,
  useLanguageChoice,
} from '../../../ui/languageChoice';
import { languageOf } from '../../../ui/languages';
import './style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import {
  type Direction,
  type CheckoutTarget,
  type TabMessage,
  type GitToHost,
  type GitToWebview,
  type Bookmark,
  type ChangeArea,
  type TextRequest,
} from '../shared/protocol';
import { createGitStore, detachedHead, GitStore } from './store';
import { areaKey } from './changesTree';
import { checkoutCommit, checkoutOptions, checkoutRef } from './checkout';
import {
  columnsClass,
  showsDiff,
  listError,
  shownSelection,
  templateOf,
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
import { type ContextMenuItem } from '../../../ui/contextMenu';
import { OpenContextMenu, type MenuEvent, type MenuTarget } from './menus';
import { Diff, DiffOptions, diffSelection } from './diffColumn';
import type { ViewedSource } from './images';
import { Files, filesTitle, listsNothing, noChangesText } from './filesColumn';
import { foldersOf } from './fileTree';
import { compareWith } from '../shared/comparisons';
import { hasRef } from '../shared/refNames';
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
import { changesShown, treeOf, treeToLoad } from './tabView';
import { bookmarkOptions, toggleBookmark } from './bookmarks';
import { repositoryMenuItems } from './repositoryMenu';
import { ConfirmPopup } from '../../../shell/page/confirmPopup';
import { ClonePopup } from './clonePopup';
import type { CloneAsk } from '../shared/clone';

export interface GitToolProps {
  active: boolean;
  post: (message: GitToHost) => void;
  listen: (handler: (message: GitToWebview) => void) => () => void;
  comparing: string | undefined;
}

export function GitTool({
  active,
  post: postToHost,
  listen,
  comparing,
}: GitToolProps) {
  const outbox = useMemo(() => settling(postToHost), [postToHost]);
  const {
    showMenu,
    closeMenu,
    setToolItems,
    setToolTitle,
    closeTab: onClose,
    changeTextView,
  } = useShellActions();
  const post = outbox.send;
  const [store] = useState(() => createGitStore(post));
  const {
    dispatch,
    changeBookmarks,
    changeShowAllFiles,
    changeCollapseMerges,
    changeSolo,
    changeAutoFetch,
    forgetRecent,
    answerInit,
    closeClone,
    toggleCommits,
    search,
  } = store.getState();
  const tab = useStore(store, (state) => state.tab);
  const worktrees = useStore(store, (state) => state.worktrees);
  const bookmarks = useStore(store, (state) => state.bookmarks);
  const detached = useStore(store, detachedHead);
  const recent = useStore(store, (state) => state.recent);
  const initAsked = useStore(store, (state) => state.initAsked);
  const clone = useStore(store, (state) => state.clone);
  const showEntireFile = useStore(store, (state) => state.showEntireFile);
  const showAllFiles = useStore(store, (state) => state.showAllFiles);
  const collapseMerges = useStore(store, (state) => state.collapseMerges);
  const solo = useStore(store, (state) => state.solo);
  const autoFetch = useStore(store, (state) => state.autoFetch);
  const autoFetchMinutes = useStore(store, (state) => state.autoFetchMinutes);
  const lastFetch = useStore(store, (state) => state.lastFetch);
  const columnWidths = useStore(store, (state) => state.columnWidths);
  const commitsShown = useStore(store, (state) => state.commitsShown);
  const searching = useStore(store, (state) => state.searching);
  const comparedFile = useStore(store, ({ compare }) =>
    compare !== undefined && compare.tab === comparing
      ? compare.new
      : undefined,
  );
  useEffect(() => listen(store.getState().receive), [listen, store]);
  const repositoryShown = active && comparing === undefined;
  useBinding(
    compareKeymap.closeCompare,
    () => {
      if (comparing !== undefined) {
        onClose(comparing);
      }
    },
    active && comparing !== undefined,
  );
  const selections = useRef(0);
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
    patch,
    leftOut,
    whitespaceOnly,
    diffs,
    refreshes,
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
  const textView = useShell((state) => state.textView);
  const { wordWrap, showWhitespace } = textView;
  const [folders, setFolders] = useState<ViewFolders>(noFolders);
  const folderView = JSON.stringify([activeTab, hash]);
  useEffect(() => {
    setFolders((all) => seeView(all, folderView));
  }, [folderView]);
  const { open: openedFolders, closed: closedFolders } = shownFolders(
    folders,
    folderView,
  );
  useEffect(
    () =>
      setToolItems(
        'git',
        repositoryMenuItems(recent, {
          onOpen: (root) => post({ type: 'openRepository', root }),
          onBrowse: () => post({ type: 'browseRepositories' }),
          onClone: () => post({ type: 'openClone' }),
          onInit: () => post({ type: 'initRepository' }),
          onRemove: forgetRecent,
        }),
      ),
    [recent, post, setToolItems, forgetRecent],
  );
  const checkCloneTarget = useCallback(
    (folder: string, name: string) =>
      post({ type: 'checkCloneTarget', folder, name }),
    [post],
  );
  useBinding(gitKeymap.commits, toggleCommits, repositoryShown);
  const commitColumnShown = commitsShown || searching;
  const columnsContainer = useRef<HTMLDivElement>(null);
  const columnsTemplate = templateOf(columnWidths, [!commitColumnShown, false]);
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
      if (comparing !== undefined) {
        setSearchAsks((asks) => ({ ...asks, diff: asks.diff + 1 }));
        return;
      }
      setSearchAsks((asks) => ({
        ...asks,
        [activeColumn]: asks[activeColumn] + 1,
      }));
      if (activeColumn === 'commits') {
        search(true);
      } else if (activeColumn === 'files' && fileFilter === undefined) {
        changeFileFilter('');
      }
    },
    active,
  );
  const [viewAsks, setViewAsks] = useState(0);
  useBinding(
    gitKeymap.viewFile,
    () => setViewAsks((asks) => asks + 1),
    active && comparing === undefined,
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

  useEffect(
    () => setToolTitle('git', comparing === undefined ? activeTab : undefined),
    [activeTab, comparing, setToolTitle],
  );
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
  const refsByCommit = useMemo(
    () => Map.groupBy(repository?.refs ?? [], (info) => info.commit),
    [repository],
  );
  const stashes = useMemo(
    () => new Set(repository?.stashes.map((stash) => stash.commit)),
    [repository],
  );

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
    if (!repositoryShown) {
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
  }, [repositoryShown, navigate]);
  useBinding(
    gitKeymap.navigate,
    (direction) => navigate(direction, 1),
    repositoryShown,
  );
  const jump = (target: string | undefined) => {
    if (target) {
      postTab({ type: 'jump', hash: target });
    }
  };
  useBinding(
    gitKeymap.head,
    () => jump(repository?.headCommit),
    repositoryShown,
  );
  useBinding(
    gitKeymap.upstream,
    () => postTab({ type: 'showUpstream' }),
    repositoryShown,
  );
  useBinding(
    gitKeymap.parent,
    () => postTab({ type: 'showParent' }),
    repositoryShown,
  );
  const loadFileDiff = useCallback(
    (file: string) => {
      if (hash) {
        postTab({ type: 'loadFileDiff', hash, path: file, diff: diffs });
      }
    },
    [hash, diffs, postTab],
  );

  const viewFile = useCallback(
    (source: ViewedSource) => postTab({ type: 'viewFile', ...source }),
    [postTab],
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
  }, [treeNeeded, activeTab, outbox, dispatch]);

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

  const changeWordWrap = (wrap: boolean) =>
    changeTextView({ ...textView, wordWrap: wrap });
  const languageTrigger = useRef<HTMLButtonElement>(null);
  const singleFile =
    comparing !== undefined
      ? JSON.stringify(['compare', comparing])
      : path === undefined
        ? undefined
        : JSON.stringify([activeTab, hash, path]);
  const detectedLanguage =
    comparing !== undefined
      ? comparedFile && languageOf(comparedFile)
      : path && languageOf(path);
  const { choice: languageChoice, choose: chooseLanguage } = useLanguageChoice(
    singleFile,
    {
      on: textView.highlightSyntax,
      change: (on) => changeTextView({ ...textView, highlightSyntax: on }),
    },
  );
  const chosenLanguage = shownLanguage(languageChoice, undefined);
  const languageButton = (
    <LanguageButton
      choice={languageChoice}
      detected={detectedLanguage}
      single={singleFile !== undefined}
      choose={chooseLanguage}
      trigger={languageTrigger}
    />
  );
  useBinding(
    gitKeymap.language,
    () => languageTrigger.current?.click(),
    active,
  );
  useBinding(gitKeymap.wrap, () => changeWordWrap(!wordWrap), active);
  const changeShowWhitespace = (show: boolean) =>
    changeTextView({ ...textView, showWhitespace: show });
  useBinding(
    gitKeymap.showWhitespace,
    () => changeShowWhitespace(!showWhitespace),
    active,
  );
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
      {clone.view && (
        <ClonePopup
          view={clone.view}
          formKey={clone.form}
          chosenFolder={clone.folder}
          checked={clone.target}
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
          onConfirm={() => answerInit(true)}
          onCancel={() => answerInit(false)}
        />
      )}
    </>
  );

  if (!active) {
    return popups;
  }

  return (
    <OpenContextMenu.Provider value={openMenu}>
      <ChosenLanguage value={chosenLanguage}>
        {popups}
        <GitStore value={store}>
          {comparing !== undefined ? (
            <CompareView
              comparing={comparing}
              findAsked={searchAsks.diff}
              language={languageButton}
            />
          ) : (
            <div className="repository">
              <WorktreeBar
                worktrees={worktrees}
                active={activeTab}
                onSelect={(root) => post({ type: 'selectWorktree', root })}
                onPreload={(root) => post({ type: 'preloadWorktree', root })}
              />
              {
                <>
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
                        event.target instanceof Element ? event.target : null,
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
                          new KeyboardEvent('keydown', event.nativeEvent),
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
                        target?.hasAttribute(columnFocusAttribute) ?? true,
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
                        postTab({
                          type: 'toggleMerge',
                          hash: merge,
                        })
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
                          onAutoFetch={changeAutoFetch}
                          lastFetch={lastFetch}
                        />
                      }
                      searchButton={
                        <SearchButton
                          title={strings.actions.search}
                          onClick={() => search(true)}
                        />
                      }
                      search={
                        <AddressBar
                          open={searching}
                          asked={searchAsks.commits}
                          onOpen={search}
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
                      selection={diffSelection(activeTab, hash, path, area)}
                      path={path}
                      loading={patchLoading || opening}
                      largeFiles={largeFiles}
                      onLoadFile={loadFileDiff}
                      texts={texts}
                      onLoadTexts={loadTexts}
                      onViewFile={viewFile}
                      viewAsked={viewAsks}
                      files={changesShown(tab)}
                      patch={patch}
                      leftOut={leftOut}
                      whitespaceOnly={whitespaceOnly}
                      diffs={diffs}
                      fileContent={fileContent}
                      error={error}
                      origin={imageOrigin}
                      findAsked={searchAsks.diff}
                      filter={fileFilter}
                      changeMarks={path !== undefined && showEntireFile}
                      entire={showEntireFile}
                      options={<DiffOptions language={languageButton} />}
                    />
                  </div>
                </>
              }
            </div>
          )}
        </GitStore>
      </ChosenLanguage>
    </OpenContextMenu.Provider>
  );
}
