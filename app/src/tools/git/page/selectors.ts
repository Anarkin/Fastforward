import { shownSelection, showsDiff } from './columnsShown';
import { type Search } from '../../../lib/shared/searchOptions';
import {
  noFolders,
  shownFolders,
  type FilterFolds,
  type Folders,
} from './viewFolders';
import type { MovedCursor } from './filesCursor';
import { treeOf, type TabView } from './shownTab';
import { listsNothing } from './filesSides';
import type { GitData, GitSource, GitState } from './state';
import type { ColumnName } from './activeColumn';

export function languageKeyOf({
  root,
  hash,
  path,
}: TabView): string | undefined {
  return path === undefined ? undefined : fileLanguageKey(root, hash, path);
}

export function openingOf({ tab }: GitSource): boolean {
  return tab.root !== undefined && tab.history === undefined && !tab.error;
}

export function layoutSelectionOf({ tab }: GitSource): string | undefined {
  return shownSelection(tab.hash, tab.workingTree);
}

export function diffShownOf(state: GitState): boolean {
  const { tab, showAllFiles } = state;
  return showsDiff(
    tab.error,
    listsNothing({
      files: tab.files,
      staged: tab.staged,
      allPaths: showAllFiles ? treeOf(tab) : undefined,
      loading: tab.filesLoading || openingOf(state),
    }),
  );
}

export function folderViewOf({ root, hash }: TabView): string {
  return JSON.stringify([root, hash]);
}

export function shownFoldersOf(state: GitSource): Folders {
  const { root } = state.tab;
  return shownFolders(
    (root === undefined ? undefined : state.folders.get(root)) ?? noFolders,
    folderViewOf(state.tab),
  );
}

export function fileFoldsOf({
  tab,
  fileFolds,
}: GitSource): FilterFolds | undefined {
  return tab.root === undefined ? undefined : fileFolds.get(tab.root);
}

export function fileCursorOf({
  tab,
  fileCursors,
}: GitSource): MovedCursor | undefined {
  return tab.root === undefined ? undefined : fileCursors.get(tab.root);
}

export function commitsShownOf({ tab, commitsHidden }: GitSource): boolean {
  return tab.root === undefined || !commitsHidden.has(tab.root);
}

export function activeColumnOf({ tab, activeColumns }: GitSource): ColumnName {
  return (
    (tab.root === undefined ? undefined : activeColumns.get(tab.root)) ??
    'commits'
  );
}

export function commitFilterOf({
  tab,
  commitFilters,
}: GitSource): Search | undefined {
  return tab.root === undefined ? undefined : commitFilters.get(tab.root);
}

export function fileFilterOf({
  tab,
  fileFilters,
}: GitSource): Search | undefined {
  return tab.root === undefined ? undefined : fileFilters.get(tab.root);
}

export function tabScopeOf(root: string | undefined): string {
  return JSON.stringify(['worktree', root ?? '']);
}

function fileLanguageKey(
  root: string | undefined,
  hash: string | undefined,
  path: string,
): string {
  return JSON.stringify([root, hash, path]);
}

export function detachedHead({ tab }: GitData): string | undefined {
  const { repository } = tab;
  return repository && !repository.head ? repository.headCommit : undefined;
}
