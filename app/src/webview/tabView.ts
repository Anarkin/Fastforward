import { shownSide, workingTreeSide } from '../shared/comparisons';
import type {
  ChangeArea,
  FileChange,
  LeftOut,
  NavigationEntry,
  RepositoryState,
  ScrollTarget,
  ToWebview,
  ToWebviewOf,
} from '../shared/protocol';
import { CommitHistory } from './commitHistory';
import { parseFilePatch, textKey, type DiffFile } from './diff';
import type { WholeFile } from './diffView';

export interface TabView {
  readonly root: string | undefined;
  readonly repository: RepositoryState | undefined;
  readonly history: CommitHistory | undefined;
  readonly scrollTarget: ScrollTarget | undefined;
  readonly workingTree: number | undefined;
  readonly hash: string | undefined;
  readonly selectionKnown: boolean;
  readonly selection: number | undefined;
  readonly files: readonly FileChange[];
  readonly staged: readonly FileChange[] | undefined;
  readonly all: readonly FileChange[] | undefined;
  readonly filesLoading: boolean;
  readonly patchLoading: boolean;
  readonly path: string | undefined;
  readonly area: ChangeArea | undefined;
  readonly entireFile: boolean;
  readonly patch: string;
  readonly leftOut: readonly LeftOut[];
  readonly whitespaceOnly: readonly string[];
  readonly diffs: number;
  readonly refreshes: number;
  readonly fileContent: WholeFile | undefined;
  readonly largeFiles: ReadonlyMap<string, DiffFile>;
  readonly texts: ReadonlyMap<string, string>;
  readonly tree: ToWebviewOf<'tree'> | undefined;
  readonly treeRequested: string | undefined;
  readonly fetching: boolean;
  readonly pulling: boolean;
  readonly pushing: boolean;
  readonly pushingTag: readonly string[];
  readonly pullingBranch: readonly string[];
  readonly pushingBranch: readonly string[];
  readonly applyingSolo: boolean;
  readonly back: readonly NavigationEntry[];
  readonly forward: readonly NavigationEntry[];
  readonly hashLookup: ToWebviewOf<'hashLookup'> | undefined;
  readonly commitSearch: ToWebviewOf<'commitSearch'> | undefined;
  readonly error: string | undefined;
}

export const emptyTabView: TabView = {
  root: undefined,
  repository: undefined,
  history: undefined,
  scrollTarget: undefined,
  workingTree: undefined,
  hash: undefined,
  selectionKnown: false,
  selection: undefined,
  files: [],
  staged: undefined,
  all: undefined,
  filesLoading: false,
  patchLoading: false,
  path: undefined,
  area: undefined,
  entireFile: false,
  patch: '',
  leftOut: [],
  whitespaceOnly: [],
  diffs: 0,
  refreshes: 0,
  fileContent: undefined,
  largeFiles: new Map(),
  texts: new Map(),
  tree: undefined,
  treeRequested: undefined,
  fetching: false,
  pulling: false,
  pushing: false,
  pushingTag: [],
  pullingBranch: [],
  pushingBranch: [],
  applyingSolo: false,
  back: [],
  forward: [],
  hashLookup: undefined,
  commitSearch: undefined,
  error: undefined,
};

export type TabAction =
  | ToWebview
  | {
      readonly type: 'showCommit';
      readonly hash: string | undefined;
      readonly selection?: number;
    }
  | {
      readonly type: 'showFile';
      readonly path: string | undefined;
      readonly area?: ChangeArea;
    }
  | { readonly type: 'showEntireFile'; readonly entire: boolean }
  | { readonly type: 'requestTree'; readonly hash: string };

function selected(state: TabView, hash: string | undefined): TabView {
  return {
    ...state,
    hash,
    selectionKnown: true,
    files: [],
    staged: undefined,
    all: undefined,
    filesLoading: hash !== undefined,
    patchLoading: hash !== undefined,
    path: undefined,
    area: undefined,
    entireFile: false,
    patch: '',
    leftOut: [],
    whitespaceOnly: [],
    fileContent: undefined,
    largeFiles: new Map(),
    texts: new Map(),
    treeRequested: hash === state.hash ? state.treeRequested : undefined,
    error: undefined,
  };
}

function isLate(
  state: TabView,
  hash: string,
  path: string | undefined,
  area = state.area,
): boolean {
  return (
    state.selectionKnown &&
    (hash !== state.hash || path !== state.path || area !== state.area)
  );
}

export function changesShown({
  area,
  files,
  staged,
  all,
}: TabView): readonly FileChange[] {
  if (area === 'staged') {
    return staged ?? [];
  }
  return (area === undefined ? all : undefined) ?? files;
}

function pickedSince(state: TabView, selection: number | undefined): boolean {
  return state.selection !== undefined && selection !== state.selection;
}

export function reduceTabView(state: TabView, action: TabAction): TabView {
  switch (action.type) {
    case 'tabs':
      return action.worktree === state.root
        ? state
        : {
            ...emptyTabView,
            root: action.worktree,
            refreshes: state.refreshes,
          };
    case 'showCommit':
      return { ...selected(state, action.hash), selection: action.selection };
    case 'showEntireFile':
      return { ...state, entireFile: action.entire };
    case 'showFile':
      return {
        ...state,
        path: action.path,
        area: action.area,
        entireFile:
          action.path === state.path &&
          action.area === state.area &&
          state.entireFile,
        selectionKnown: true,
        patchLoading: state.hash !== undefined,
        patch: '',
        leftOut: [],
        whitespaceOnly: [],
        fileContent: undefined,
        largeFiles: new Map(),
        texts: new Map(),
        error: undefined,
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
        action.keysFrom,
      );
      history.add(action.start, action.commits, action.graph);
      return {
        ...state,
        history,
        scrollTarget: action.scrollTarget,
      };
    }
    case 'commitPage':
      if (action.generation !== state.history?.generation) {
        return state;
      }
      if (action.commits.length === 0) {
        state.history.release(action.start, action.count);
        return state;
      }
      state.history.add(action.start, action.commits, action.graph);
      return action.commits.some((commit) => commit.hash === state.hash)
        ? { ...state }
        : state;
    case 'unselect':
      return pickedSince(state, action.selection)
        ? state
        : selected(state, undefined);
    case 'reveal':
      if (pickedSince(state, action.selection)) {
        return state;
      }
      state.history?.locate(shownSide(action.hash), action.index);
      return {
        ...selected(state, action.hash),
        scrollTarget: { index: action.index },
      };
    case 'workingTree':
      if (state.hash !== undefined && workingTreeSide(state.hash)) {
        return {
          ...state,
          workingTree: action.files,
          refreshes: state.refreshes + 1,
        };
      }
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
        staged: action.staged,
        all: action.all,
        filesLoading: false,
      };
    case 'diff':
      if (isLate(state, action.hash, action.path, action.area)) {
        return state;
      }
      return {
        ...state,
        hash: action.hash,
        path: action.path,
        area: action.area,
        patch: action.patch,
        leftOut: action.leftOut ?? [],
        whitespaceOnly: action.whitespaceOnly ?? [],
        diffs: state.diffs + 1,
        patchLoading: false,
        fileContent: undefined,
        largeFiles: new Map(),
        texts: new Map(),
      };
    case 'fileDiff':
      return action.hash === state.hash && action.diff === state.diffs
        ? {
            ...state,
            largeFiles: new Map(state.largeFiles).set(
              action.path,
              parseFilePatch(action.path, action.patch, action.whitespaceOnly),
            ),
          }
        : state;
    case 'texts':
      return action.hash === state.hash && action.diff === state.diffs
        ? {
            ...state,
            texts: new Map([
              ...state.texts,
              ...action.texts.flatMap(({ path, side, text }) =>
                text === undefined
                  ? []
                  : [[textKey(path, side), text] as const],
              ),
            ]),
          }
        : state;
    case 'fileContent':
      if (isLate(state, action.hash, action.path, action.area)) {
        return state;
      }
      return {
        ...state,
        hash: action.hash,
        path: action.path,
        area: action.area,
        patch: '',
        leftOut: [],
        whitespaceOnly: [],
        patchLoading: false,
        fileContent: action,
      };
    case 'tree':
      return isLate(state, action.hash, state.path)
        ? state
        : { ...state, tree: action };
    case 'requestTree':
      return { ...state, treeRequested: action.hash };
    case 'fetching':
      return { ...state, fetching: action.running };
    case 'pulling':
      return { ...state, pulling: action.running };
    case 'pushing':
      return { ...state, pushing: action.running };
    case 'pushingTag':
      return { ...state, pushingTag: action.names };
    case 'pullingBranch':
      return { ...state, pullingBranch: action.names };
    case 'pushingBranch':
      return { ...state, pushingBranch: action.names };
    case 'applyingSolo':
      return { ...state, applyingSolo: action.running };
    case 'navigation':
      return { ...state, back: action.back, forward: action.forward };
    case 'hashLookup':
      return { ...state, hashLookup: action };
    case 'commitSearch':
      return { ...state, commitSearch: action };
    case 'error':
      return {
        ...state,
        error: action.message,
        filesLoading: false,
        patchLoading: false,
      };
    case 'clearError':
      return action.message === state.error
        ? { ...state, error: undefined }
        : state;
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

export function treeOf(state: TabView): readonly string[] | undefined {
  const { hash, tree } = state;
  return hash !== undefined && tree?.hash === hash ? tree.paths : undefined;
}
