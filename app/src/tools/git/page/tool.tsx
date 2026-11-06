import { compareKeymap, gitKeymap } from '../shared/keymap';
import { CompareView } from './compareView';
import { useShell, useShellActions } from '../../../shell/page/store';
import { LanguageButton, useLanguageChoice } from '../../../ui/languageChoice';
import { languageOf } from '../../../ui/languages';
import './style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { type GitToHost, type GitToWebview } from '../shared/protocol';
import {
  compareLanguageKey,
  createGitStore,
  fileLanguageKey,
  GitStore,
  pickedFor,
} from './store';
import { areaKey } from './changesTree';
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
import { Commits } from './commitList';
import { clicked } from '../../../shell/shared/keymap';
import { useBinding } from '../../../ui/shortcuts';
import { Diff, DiffOptions, diffSelection } from './diffColumn';
import { Files, filesTitle, listsNothing, noChangesText } from './filesColumn';
import { foldersOf } from './fileTree';
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
import { repositoryMenuItems } from './repositoryMenu';
import { ConfirmPopup } from '../../../shell/page/confirmPopup';
import { ClonePopup } from './clonePopup';

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
  const {
    closeMenu,
    setToolItems,
    setToolTitle,
    closeTab: onClose,
    changeTextView,
  } = useShellActions();
  const [store] = useState(() => createGitStore(postToHost));
  const {
    selectCommit,
    compareCommit,
    selectFile,
    navigate,
    jump,
    showUpstream,
    showParent,
    lookupHash,
    searchCommits,
    fetch: fetchRemotes,
    toggleMerge,
    scrolled,
    loadCommits,
    loadFileDiff,
    loadTexts,
    viewFile,
    requestTree,
    openRepository,
    browseRepositories,
    openClone,
    initRepository,
    checkCloneTarget,
    chooseCloneFolder,
    startClone,
    stopClone,
    selectWorktree,
    preloadWorktree,
    changeShowAllFiles,
    changeCollapseMerges,
    changeSolo,
    changeAutoFetch,
    forgetRecent,
    answerInit,
    closeClone,
    toggleCommits,
    search,
    pickLanguage,
  } = store.getState();
  const tab = useStore(store, (state) => state.tab);
  const worktrees = useStore(store, (state) => state.worktrees);
  const bookmarks = useStore(store, (state) => state.bookmarks);
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
          onOpen: openRepository,
          onBrowse: browseRepositories,
          onClone: openClone,
          onInit: initRepository,
          onRemove: forgetRecent,
        }),
      ),
    [
      recent,
      setToolItems,
      forgetRecent,
      openRepository,
      browseRepositories,
      openClone,
      initRepository,
    ],
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

  const onScrolled = useCallback(
    (top: string, offset: number, report: number) =>
      scrolled(activeTab, top, offset, report),
    [scrolled, activeTab],
  );
  const refsByCommit = useStore(store, (state) => state.refsByCommit);
  const stashes = useStore(store, (state) => state.stashCommits);

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
  useBinding(
    gitKeymap.head,
    () => jump(repository?.headCommit),
    repositoryShown,
  );
  useBinding(gitKeymap.upstream, showUpstream, repositoryShown);
  useBinding(gitKeymap.parent, showParent, repositoryShown);
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

  const treeNeeded = showAllFiles ? treeToLoad(tab) : undefined;
  useEffect(() => {
    if (treeNeeded) {
      requestTree(treeNeeded);
    }
  }, [treeNeeded, requestTree]);

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
      ? compareLanguageKey(comparing)
      : path === undefined
        ? undefined
        : fileLanguageKey(activeTab, hash, path);
  const pickedLanguage = useStore(store, pickedFor(singleFile));
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
    {
      language: pickedLanguage,
      keep: (language) => pickLanguage(singleFile, language),
    },
  );
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
  const popups = (
    <>
      {clone.view && (
        <ClonePopup
          view={clone.view}
          formKey={clone.form}
          chosenFolder={clone.folder}
          checked={clone.target}
          onCheck={checkCloneTarget}
          onChooseFolder={chooseCloneFolder}
          onClone={startClone}
          onStop={stopClone}
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
    <>
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
              onSelect={selectWorktree}
              onPreload={preloadWorktree}
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
                      event.target instanceof HTMLElement ? event.target : null;
                    const forwarded = forwardedColumn(columnOf(target), event);
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
                    onToggleMerge={toggleMerge}
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
                        onFetch={fetchRemotes}
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
                    languageKey={singleFile}
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
    </>
  );
}
