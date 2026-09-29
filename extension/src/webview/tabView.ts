import type {
  FileChange,
  HashLookup,
  NavigationEntry,
  RepositoryState,
  ToWebview,
} from '../shared/protocol';
import { CommitHistory } from './commitHistory';
import { parseFilePatch, type DiffFile } from './diff';
import type { WholeFile } from './diffView';

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
  readonly repository: RepositoryState | undefined;
  // Filled in place as pages arrive, which the commit list follows by itself;
  // the view is a new object when the selected commit's page arrives, so the
  // address bar shows it
  readonly history: CommitHistory | undefined;
  readonly scrollTarget: ScrollTarget | undefined;
  // Number of uncommitted files, undefined until the extension reports it
  readonly workingTree: number | undefined;
  readonly hash: string | undefined;
  // Whether hash and path are what was last selected, by the user or the
  // extension, so only answers about them are shown, not a late one about
  // the selection before; after another tab opens, the answers say what it
  // shows
  readonly selectionKnown: boolean;
  readonly files: readonly FileChange[];
  // Asked for and not answered yet, which shows placeholders
  readonly filesLoading: boolean;
  readonly patchLoading: boolean;
  readonly path: string | undefined;
  readonly patch: string;
  // How many diffs have arrived, as the large files are fetched again for
  // each, even one whose answer to the diff before is on its way
  readonly diffs: number;
  // A file the commit didn't change, shown whole in the Diff column
  readonly fileContent: WholeFile | undefined;
  // The large files the commit's diff left out, by path, fetched when opened
  // and parsed once as they come
  readonly largeFiles: ReadonlyMap<string, DiffFile>;
  // Every file of the repository at the selected commit, for the Files view
  readonly tree: { hash: string; paths: readonly string[] } | undefined;
  // The commit whose tree was last asked for, asked once, not again when a
  // tree of another commit arrives while this one is on its way; forgotten
  // when another tab opens, as the extension forgets the tree of a closed tab
  readonly treeRequested: string | undefined;
  // Whether a fetch is running
  readonly fetching: boolean;
  // The commits back and forward, nearest first
  readonly back: readonly NavigationEntry[];
  readonly forward: readonly NavigationEntry[];
  // The last hash typed in the address bar, and which commit it is
  readonly hashLookup: { query: string; result: HashLookup } | undefined;
  readonly error: string | undefined;
}

export const emptyTabView: TabView = {
  repository: undefined,
  history: undefined,
  scrollTarget: undefined,
  workingTree: undefined,
  hash: undefined,
  selectionKnown: false,
  files: [],
  filesLoading: false,
  patchLoading: false,
  path: undefined,
  patch: '',
  diffs: 0,
  fileContent: undefined,
  largeFiles: new Map(),
  tree: undefined,
  treeRequested: undefined,
  fetching: false,
  back: [],
  forward: [],
  hashLookup: undefined,
  error: undefined,
};

export type TabAction =
  | ToWebview
  // Another tab opened
  | { readonly type: 'clear' }
  // The user selected a commit or a file, shown while its answer loads
  | { readonly type: 'showCommit'; readonly hash: string | undefined }
  | { readonly type: 'showFile'; readonly path: string | undefined }
  // The page asked for the tree of a commit
  | { readonly type: 'requestTree'; readonly hash: string };

// A commit as selected, with nothing of the previous one left
function selected(state: TabView, hash: string | undefined): TabView {
  return {
    ...state,
    hash,
    selectionKnown: true,
    files: [],
    filesLoading: hash !== undefined,
    patchLoading: hash !== undefined,
    path: undefined,
    patch: '',
    fileContent: undefined,
    largeFiles: new Map(),
    error: undefined,
  };
}

// An answer about a commit or file selected before the one now, which was on
// its way when the user moved on, as during fast arrow-key movement
function isLate(
  state: TabView,
  hash: string,
  path: string | undefined,
): boolean {
  return state.selectionKnown && (hash !== state.hash || path !== state.path);
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
        selectionKnown: true,
        patchLoading: state.hash !== undefined,
      };
    case 'repository':
      return { ...state, repository: action };
    case 'commits': {
      const history = new CommitHistory(
        action.total,
        action.decorations,
        action.workingTreeGraph,
        action.generation,
        action.selectedIndex,
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
      // A page of the history before, which the new one asks for again
      if (action.generation !== state.history?.generation) {
        return state;
      }
      if (action.commits.length === 0) {
        state.history.release(action.start);
        return state;
      }
      // The history is filled in place, which is safe to repeat, as a page
      // always lands at the same positions
      state.history.add(action.start, action.commits, action.graph);
      return action.commits.some((commit) => commit.hash === state.hash)
        ? { ...state }
        : state;
    case 'reveal':
      // Known where it is before its page loads, for the arrow keys
      state.history?.locate(action.hash, action.index);
      return {
        ...selected(state, action.hash),
        scrollTarget: { index: action.index },
      };
    case 'workingTree':
      return action.files === state.workingTree
        ? state
        : { ...state, workingTree: action.files };
    case 'files':
      if (isLate(state, action.hash, state.path)) {
        return state;
      }
      return {
        ...state,
        hash: action.hash,
        files: action.files,
        filesLoading: false,
      };
    case 'diff':
      if (isLate(state, action.hash, action.path)) {
        return state;
      }
      return {
        ...state,
        hash: action.hash,
        path: action.path,
        patch: action.patch,
        diffs: state.diffs + 1,
        patchLoading: false,
        fileContent: undefined,
        // Fetched again for the new diff when still open
        largeFiles: new Map(),
      };
    case 'fileDiff':
      return action.hash === state.hash && action.diff === state.diffs
        ? {
            ...state,
            largeFiles: new Map(state.largeFiles).set(
              action.path,
              parseFilePatch(action.path, action.patch),
            ),
          }
        : state;
    case 'fileContent':
      if (isLate(state, action.hash, action.path)) {
        return state;
      }
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
    case 'requestTree':
      return { ...state, treeRequested: action.hash };
    case 'fetching':
      return { ...state, fetching: action.running };
    case 'navigation':
      return { ...state, back: action.back, forward: action.forward };
    case 'hashLookup':
      return { ...state, hashLookup: action };
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

// The commit whose tree the Files view needs and has not asked for yet
export function treeToLoad(state: TabView): string | undefined {
  const { hash, tree, treeRequested } = state;
  return hash && tree?.hash !== hash && treeRequested !== hash
    ? hash
    : undefined;
}
