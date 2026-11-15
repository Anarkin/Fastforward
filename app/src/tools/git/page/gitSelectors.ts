import { shownSelection, showsDiff } from './columnsShown';
import { noSearch, type Search } from '../../../lib/shared/searchOptions';
import { shownFolders, type Folders } from './viewFolders';
import { treeOf, type TabView } from './tabView';
import { listsNothing } from './filesSides';
import type { GitData, GitSource, GitState } from './gitState';

export function languageKeyOf(
  comparing: string | undefined,
  { root, hash, path }: TabView,
): string | undefined {
  return comparing !== undefined
    ? compareLanguageKey(comparing)
    : path === undefined
      ? undefined
      : fileLanguageKey(root, hash, path);
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
  return shownFolders(state.folders, folderViewOf(state.tab));
}

export function searchOf({ tab, searches }: GitSource): Search {
  return tab.root === undefined
    ? noSearch
    : (searches.get(tab.root) ?? noSearch);
}

export function fileFilterOf({
  tab,
  fileFilters,
}: GitSource): Search | undefined {
  return tab.root === undefined ? undefined : fileFilters.get(tab.root);
}

export function compareLanguageKey(comparing: string): string {
  return JSON.stringify(['compare', comparing]);
}

function fileLanguageKey(
  root: string | undefined,
  hash: string | undefined,
  path: string,
): string {
  return JSON.stringify([root, hash, path]);
}

export const pickedFor =
  (key: string | undefined) =>
  ({ pickedLanguage }: GitSource): string | undefined =>
    pickedLanguage !== undefined && pickedLanguage.key === key
      ? pickedLanguage.language
      : undefined;

export function detachedHead({ tab }: GitData): string | undefined {
  const { repository } = tab;
  return repository && !repository.head ? repository.headCommit : undefined;
}
