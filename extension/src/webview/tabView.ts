import type { FileChange, SyncAction, ToWebview } from '../protocol';
import { CommitHistory } from './commitHistory';
import type { WholeFile } from './diffView';
import type { Repository } from './locations';

// A position to scroll the commit list to; a new object scrolls again even to
// the same position
export interface ScrollTarget {
  readonly index: number;
  // Pixels scrolled into that row, to put it exactly where it was
  readonly offset?: number;
}

// Everything the page shows for the active tab, in one object, so switching
// tabs starts over from emptyTabView instead of resetting field by field
export interface TabView {
  readonly repository: Repository | undefined;
  // Filled in place as pages arrive, which the commit list follows by itself;
  // the version changes when the selected commit's page arrives, whose
  // details the Diff column shows
  readonly history: CommitHistory | undefined;
  readonly historyVersion: number;
  readonly scrollTarget: ScrollTarget | undefined;
  // Number of uncommitted files, undefined until the extension reports it
  readonly workingTree: number | undefined;
  readonly hash: string | undefined;
  readonly files: readonly FileChange[];
  // Asked for and not answered yet, which shows placeholders
  readonly filesLoading: boolean;
  readonly patchLoading: boolean;
  readonly path: string | undefined;
  readonly patch: string;
  // A file the commit didn't change, shown whole in the Diff column
  readonly fileContent: WholeFile | undefined;
  // Diffs of the large files the commit's diff left out, by path, fetched
  // when opened
  readonly filePatches: ReadonlyMap<string, string>;
  // Every file of the repository at the selected commit, for the Files view
  readonly tree: { hash: string; paths: readonly string[] } | undefined;
  // A pull or push that is running
  readonly syncing: SyncAction | undefined;
  readonly error: string | undefined;
}

export const emptyTabView: TabView = {
  repository: undefined,
  history: undefined,
  historyVersion: 0,
  scrollTarget: undefined,
  workingTree: undefined,
  hash: undefined,
  files: [],
  filesLoading: false,
  patchLoading: false,
  path: undefined,
  patch: '',
  fileContent: undefined,
  filePatches: new Map(),
  tree: undefined,
  syncing: undefined,
  error: undefined,
};

export type TabAction =
  | ToWebview
  // Another tab opened
  | { readonly type: 'clear' }
  // The user selected a commit or a file, shown while its answer loads
  | { readonly type: 'showCommit'; readonly hash: string | undefined }
  | { readonly type: 'showFile'; readonly path: string | undefined };

// A commit as selected, with nothing of the previous one left
function selected(state: TabView, hash: string | undefined): TabView {
  return {
    ...state,
    hash,
    files: [],
    filesLoading: hash !== undefined,
    patchLoading: hash !== undefined,
    path: undefined,
    patch: '',
    fileContent: undefined,
    filePatches: new Map(),
    error: undefined,
  };
}

// The next view after a message from the extension or a selection; messages
// that aren't about the tab leave it as it is
export function reduceTabView(state: TabView, action: TabAction): TabView {
  switch (action.type) {
    case 'clear':
      return emptyTabView;
    case 'showCommit':
      return selected(state, action.hash);
    case 'showFile':
      return {
        ...state,
        path: action.path,
        patchLoading: state.hash !== undefined,
      };
    case 'repository':
      return { ...state, repository: action };
    case 'commits': {
      const history = new CommitHistory(
        action.total,
        action.decorations,
        action.graphWidth,
        action.workingTreeGraph,
      );
      history.add(action.start, action.commits, action.graph);
      return {
        ...state,
        history,
        // A reload keeps the list where it was; otherwise it shows the
        // selected commit
        scrollTarget:
          action.anchor ??
          (action.selectedIndex === undefined
            ? undefined
            : { index: action.selectedIndex }),
      };
    }
    case 'commitPage':
      // The history is filled in place, which is safe to repeat, as a page
      // always lands at the same positions
      state.history?.add(action.start, action.commits, action.graph);
      return action.commits.some((commit) => commit.hash === state.hash)
        ? { ...state, historyVersion: state.historyVersion + 1 }
        : state;
    case 'reveal':
      return {
        ...selected(state, action.hash),
        scrollTarget: { index: action.index },
      };
    case 'workingTree':
      return { ...state, workingTree: action.files };
    case 'files':
      return {
        ...state,
        hash: action.hash,
        files: action.files,
        filesLoading: false,
      };
    case 'diff':
      return {
        ...state,
        hash: action.hash,
        path: action.path,
        patch: action.patch,
        patchLoading: false,
        fileContent: undefined,
        // Fetched again for the new diff when still open
        filePatches: new Map(),
      };
    case 'fileDiff':
      return action.hash === state.hash
        ? {
            ...state,
            filePatches: new Map(state.filePatches).set(
              action.path,
              action.patch,
            ),
          }
        : state;
    case 'fileContent':
      return {
        ...state,
        hash: action.hash,
        path: action.path,
        patch: '',
        patchLoading: false,
        fileContent: action,
      };
    case 'tree':
      return { ...state, tree: action };
    case 'syncing':
      return { ...state, syncing: action.action };
    case 'error':
      return {
        ...state,
        error: action.message,
        filesLoading: false,
        patchLoading: false,
      };
    default:
      return state;
  }
}
