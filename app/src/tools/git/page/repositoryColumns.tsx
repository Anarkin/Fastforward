import { memo, useCallback, useMemo, useState } from 'react';
import { strings } from '../../../shared/strings';
import { SearchButton } from '../../../ui/search';
import { useBinding } from '../../../ui/shortcuts';
import { gitKeymap } from '../shared/keymap';
import { listError } from './columns';
import { Commits } from './commitList';
import { Diff, DiffLanguage, DiffOptions, diffSelection } from './diffColumn';
import { Files, filesTitle, noChangesText } from './filesColumn';
import { AddressBar, NavButtons } from './navBar';
import {
  fileFilterOf,
  folderViewOf,
  languageKeyOf,
  layoutSelectionOf,
  openingOf,
  shownFoldersOf,
  useGit,
  useGitActions,
} from './store';
import { changesShown, treeOf } from './tabView';

export const CommitColumn = memo(function CommitColumn() {
  const history = useGit((state) => state.tab.history);
  const worktree = useGit((state) => state.tab.root);
  const opening = useGit(openingOf);
  const scrollTarget = useGit((state) => state.tab.scrollTarget);
  const workingTree = useGit((state) => state.tab.workingTree);
  const refsByCommit = useGit((state) => state.refsByCommit);
  const stashes = useGit((state) => state.stashCommits);
  const selected = useGit((state) => state.tab.hash);
  const collapseMerges = useGit((state) => state.collapseMerges);
  const solo = useGit((state) => state.solo);
  const headCommit = useGit((state) => state.tab.repository?.headCommit);
  const searching = useGit((state) => state.searching);
  const error = useGit((state) =>
    listError(state.tab.error, layoutSelectionOf(state)),
  );
  const applyingSolo = useGit((state) => state.tab.applyingSolo);
  const findsHere = useGit((state) => state.activeColumn === 'commits');
  const {
    selectCommit,
    compareCommit,
    toggleMerge,
    changeCollapseMerges,
    changeSolo,
    scrolled,
    loadCommits,
    search,
  } = useGitActions();
  const [asked, setAsked] = useState(0);
  useBinding(
    gitKeymap.find,
    () => {
      setAsked((count) => count + 1);
      search(true);
    },
    findsHere,
  );
  const onScrolled = useCallback(
    (top: string, offset: number, report: number) =>
      scrolled(worktree, top, offset, report),
    [scrolled, worktree],
  );
  return (
    <Commits
      history={history}
      worktree={worktree}
      opening={opening}
      scrollTarget={scrollTarget}
      onScrolled={onScrolled}
      onLoad={loadCommits}
      workingTree={workingTree}
      refsByCommit={refsByCommit}
      stashes={stashes}
      selected={selected}
      onSelect={selectCommit}
      onCompare={compareCommit}
      onToggleMerge={toggleMerge}
      collapseMerges={collapseMerges}
      onCollapseMerges={changeCollapseMerges}
      solo={solo}
      headCommit={headCommit}
      focusKey={worktree}
      searching={searching}
      error={error}
      applyingSolo={applyingSolo}
      onSolo={changeSolo}
      navigation={<NavButtons />}
      searchButton={
        <SearchButton
          title={strings.actions.search}
          onClick={() => search(true)}
        />
      }
      search={<AddressBar asked={asked} />}
    />
  );
});

export const FileColumn = memo(function FileColumn() {
  const hash = useGit((state) => state.tab.hash);
  const error = useGit((state) => state.tab.error);
  const showAll = useGit((state) => state.showAllFiles);
  const files = useGit((state) => state.tab.files);
  const staged = useGit((state) => state.tab.staged);
  const loading = useGit((state) => state.tab.filesLoading || openingOf(state));
  const tree = useGit((state) => treeOf(state.tab));
  const folders = useGit(shownFoldersOf);
  const selected = useGit((state) => state.tab.path);
  const area = useGit((state) => state.tab.area);
  const view = useGit((state) => folderViewOf(state.tab));
  const filter = useGit(fileFilterOf);
  const filtersHere = useGit((state) => state.activeColumn === 'files');
  const {
    changeShowAllFiles,
    toggleFolder,
    replaceFolders,
    selectFile,
    filterFiles,
  } = useGitActions();
  const [filterAsked, setFilterAsked] = useState(0);
  useBinding(
    gitKeymap.find,
    () => {
      setFilterAsked((count) => count + 1);
      if (filter === undefined) {
        filterFiles('');
      }
    },
    filtersHere,
  );
  return (
    <Files
      title={filesTitle(hash)}
      noChanges={noChangesText(hash, error)}
      showAll={showAll}
      onShowAll={changeShowAllFiles}
      closedFolders={folders.closed}
      onToggleClosedFolder={(folder) => toggleFolder('closed', folder)}
      files={files}
      staged={staged}
      loading={loading}
      tree={tree}
      openedFolders={folders.open}
      onToggleOpenFolder={(folder) => toggleFolder('open', folder)}
      onReplaceFolders={replaceFolders}
      selected={selected}
      area={area}
      onSelect={selectFile}
      view={view}
      filter={filter}
      onFilter={filterFiles}
      filterAsked={filterAsked}
    />
  );
});

export const RepositoryDiff = memo(function RepositoryDiff() {
  const root = useGit((state) => state.tab.root);
  const hash = useGit((state) => state.tab.hash);
  const path = useGit((state) => state.tab.path);
  const area = useGit((state) => state.tab.area);
  const loading = useGit((state) => state.tab.patchLoading || openingOf(state));
  const largeFiles = useGit((state) => state.tab.largeFiles);
  const texts = useGit((state) => state.tab.texts);
  const files = useGit((state) => changesShown(state.tab));
  const patch = useGit((state) => state.tab.patch);
  const leftOut = useGit((state) => state.tab.leftOut);
  const whitespaceOnly = useGit((state) => state.tab.whitespaceOnly);
  const diffs = useGit((state) => state.tab.diffs);
  const refreshes = useGit((state) => state.tab.refreshes);
  const fileContent = useGit((state) => state.tab.fileContent);
  const error = useGit((state) => state.tab.error);
  const filter = useGit(fileFilterOf);
  const languageKey = useGit((state) => languageKeyOf(undefined, state.tab));
  const entire = useGit((state) => state.showEntireFile);
  const findsHere = useGit((state) => state.activeColumn === 'diff');
  const { loadFileDiff, loadTexts, viewFile } = useGitActions();
  const [findAsked, setFindAsked] = useState(0);
  const [viewAsked, setViewAsked] = useState(0);
  useBinding(
    gitKeymap.find,
    () => setFindAsked((count) => count + 1),
    findsHere,
  );
  useBinding(gitKeymap.viewFile, () => setViewAsked((count) => count + 1));
  const origin = useMemo(
    () =>
      root === undefined || hash === undefined
        ? undefined
        : {
            root,
            hash,
            ...(area === undefined ? {} : { area }),
            version: `${diffs}.${refreshes}`,
          },
    [root, hash, area, diffs, refreshes],
  );
  return (
    <Diff
      selection={diffSelection(root, hash, path, area)}
      path={path}
      loading={loading}
      largeFiles={largeFiles}
      onLoadFile={loadFileDiff}
      texts={texts}
      onLoadTexts={loadTexts}
      onViewFile={viewFile}
      viewAsked={viewAsked}
      files={files}
      patch={patch}
      leftOut={leftOut}
      whitespaceOnly={whitespaceOnly}
      diffs={diffs}
      fileContent={fileContent}
      error={error}
      origin={origin}
      findAsked={findAsked}
      filter={filter}
      languageKey={languageKey}
      changeMarks={path !== undefined && entire}
      entire={entire}
      options={
        <DiffOptions language={<DiffLanguage comparing={undefined} />} />
      }
    />
  );
});
