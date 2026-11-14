import type { CloneView } from '../shared/clone';
import type { GitToWebview, GitToWebviewOf } from '../shared/protocol';
import type { CloneTarget } from './clonePopup';
import { widthsToLoad } from './columns';
import { textKey } from './diff';
import { reduceTabView, type TabAction } from './tabView';

import type { Cloning, ComparedTexts, GitState } from './store';

export const noComparedTexts: ComparedTexts = {
  tab: undefined,
  texts: new Map(),
};

export function withTab(state: GitState, action: TabAction): GitState {
  const tab = reduceTabView(state.tab, action);
  return tab === state.tab ? state : { ...state, tab };
}

function withTexts(
  compared: ComparedTexts,
  { tab, texts }: GitToWebviewOf<'compareTexts'>,
): ComparedTexts {
  const known = new Map(compared.tab === tab ? compared.texts : []);
  for (const loaded of texts) {
    known.set(textKey(loaded.path, loaded.side), {
      blob: loaded.blob,
      text: loaded.text,
    });
  }
  return { tab, texts: known };
}

function isTarget(
  target: CloneTarget | undefined,
  { folder, name }: CloneTarget,
): boolean {
  return target?.folder === folder && target.name === name;
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
      return { ...withTab(state, message), worktrees: message.worktrees };
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
        hideDimmed: message.hideDimmedButtons,
      };
    case 'solo':
      return { ...state, solo: message.solo };
    case 'compare':
      return {
        ...state,
        compare: message.compare,
        compareTexts:
          message.compare?.tab === state.compareTexts.tab
            ? state.compareTexts
            : noComparedTexts,
      };
    case 'compareTexts':
      return { ...state, compareTexts: withTexts(state.compareTexts, message) };
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
