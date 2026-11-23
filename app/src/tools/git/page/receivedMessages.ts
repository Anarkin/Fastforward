import type { CloneView } from '../shared/clone';
import type { GitToWebview } from '../shared/protocol';
import type { CloneTarget } from './cloneForm';
import { widthsToLoad } from './columns';
import { reduceTabView, type TabAction, type TabView } from './shownTab';
import { withEntry } from '../../../lib/page/tabKeyed';

import type { Cloning, GitState } from './state';

export function withTab(state: GitState, action: TabAction): GitState {
  const tab = reduceTabView(state.tab, action);
  return tab === state.tab ? state : { ...state, tab };
}

function isTarget(
  target: CloneTarget | undefined,
  { folder, name }: CloneTarget,
): boolean {
  return target?.folder === folder && target.name === name;
}

function withFoundCommits(state: GitState, left: TabView): GitState {
  const { root, commitSearch, hashLookup } = left;
  if (state.tab === left) {
    return state;
  }
  const foundCommits = withEntry(
    state.foundCommits,
    root,
    commitSearch === undefined && hashLookup === undefined
      ? undefined
      : { commitSearch, hashLookup },
  );
  const back =
    state.tab.root === undefined ? undefined : foundCommits.get(state.tab.root);
  return {
    ...state,
    foundCommits,
    ...(back !== undefined && { tab: { ...state.tab, ...back } }),
  };
}

export function checking(clone: Cloning, target: CloneTarget): Cloning {
  return isTarget(clone.target, target) ? clone : { ...clone, target };
}

function cloned(clone: Cloning, view: CloneView | undefined): Cloning {
  return view?.kind === 'form'
    ? { ...clone, view, form: clone.form + 1, folder: undefined }
    : { ...clone, view };
}

export function received(state: GitState, message: GitToWebview): GitState {
  switch (message.type) {
    case 'worktrees':
      return {
        ...withFoundCommits(withTab(state, message), state.tab),
        worktrees: message.worktrees,
      };
    case 'bookmarks':
      return { ...state, bookmarks: message.bookmarks };
    case 'layout':
      return {
        ...state,
        columnWidths: widthsToLoad(
          message.columnWidths,
          message.defaultColumnWidths,
        ),
        defaultColumnWidths: message.defaultColumnWidths,
        collapseMerges: message.collapseMerges,
        showEntireFile: message.showEntireFile,
        ignoreWhitespace: message.ignoreWhitespace,
        diffLayout: message.diffLayout,
        showAllFiles: message.showAllFiles,
        autoFetch: message.autoFetch,
        autoFetchMinutes: message.autoFetchMinutes,
      };
    case 'solo':
      return { ...state, solo: message.solo };
    case 'recent':
      return { ...state, recent: message.recent };
    case 'confirmInit':
      return { ...state, initAsked: message };
    case 'clone':
      return { ...state, clone: cloned(state.clone, message.view) };
    case 'cloneFolder':
      return {
        ...state,
        clone: { ...state.clone, folder: { folder: message.folder } },
      };
    case 'cloneTarget':
      return isTarget(state.clone.target, message)
        ? { ...state, clone: { ...state.clone, target: message } }
        : state;
    case 'lastFetch':
      return { ...state, lastFetch: message };
    default:
      return withTab(state, message);
  }
}
