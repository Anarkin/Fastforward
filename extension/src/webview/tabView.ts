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

export interface ScrollTarget {
  readonly index: number;
  readonly offset?: number;
}

export interface TabView {
  readonly repository: RepositoryState | undefined;
  readonly history: CommitHistory | undefined;
  readonly scrollTarget: ScrollTarget | undefined;
  readonly workingTree: number | undefined;
  readonly hash: string | undefined;
  readonly selectionKnown: boolean;
  readonly files: readonly FileChange[];
  readonly filesLoading: boolean;
  readonly patchLoading: boolean;
  readonly path: string | undefined;
  readonly patch: string;
  readonly diffs: number;
  readonly fileContent: WholeFile | undefined;
  readonly largeFiles: ReadonlyMap<string, DiffFile>;
  readonly tree: { hash: string; paths: readonly string[] } | undefined;
  readonly treeRequested: string | undefined;
  readonly fetching: boolean;
  readonly back: readonly NavigationEntry[];
  readonly forward: readonly NavigationEntry[];
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
  | { readonly type: 'clear' }
  | { readonly type: 'showCommit'; readonly hash: string | undefined }
  | { readonly type: 'showFile'; readonly path: string | undefined }
  | { readonly type: 'requestTree'; readonly hash: string };

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

function isLate(
  state: TabView,
  hash: string,
  path: string | undefined,
): boolean {
  return state.selectionKnown && (hash !== state.hash || path !== state.path);
}

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
        patch: '',
        fileContent: undefined,
        largeFiles: new Map(),
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
        scrollTarget:
          action.anchor ??
          (action.selectedIndex === undefined
            ? undefined
            : { index: action.selectedIndex }),
      };
    }
    case 'commitPage':
      if (action.generation !== state.history?.generation) {
        return state;
      }
      if (action.commits.length === 0) {
        state.history.release(action.start);
        return state;
      }
      state.history.add(action.start, action.commits, action.graph);
      return action.commits.some((commit) => commit.hash === state.hash)
        ? { ...state }
        : state;
    case 'reveal':
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

export function treeToLoad(state: TabView): string | undefined {
  const { hash, tree, treeRequested } = state;
  return hash && tree?.hash !== hash && treeRequested !== hash
    ? hash
    : undefined;
}
