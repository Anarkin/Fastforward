import { comparedOf } from '../shared/comparisons';
import type {
  FileChange,
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
  readonly files: readonly FileChange[];
  readonly filesLoading: boolean;
  readonly patchLoading: boolean;
  readonly path: string | undefined;
  readonly entireFile: boolean;
  readonly patch: string;
  readonly diffs: number;
  readonly fileContent: WholeFile | undefined;
  readonly largeFiles: ReadonlyMap<string, DiffFile>;
  readonly texts: ReadonlyMap<string, string>;
  readonly tree: ToWebviewOf<'tree'> | undefined;
  readonly treeRequested: string | undefined;
  readonly fetching: boolean;
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
  files: [],
  filesLoading: false,
  patchLoading: false,
  path: undefined,
  entireFile: false,
  patch: '',
  diffs: 0,
  fileContent: undefined,
  largeFiles: new Map(),
  texts: new Map(),
  tree: undefined,
  treeRequested: undefined,
  fetching: false,
  applyingSolo: false,
  back: [],
  forward: [],
  hashLookup: undefined,
  commitSearch: undefined,
  error: undefined,
};

export type TabAction =
  | ToWebview
  | { readonly type: 'showCommit'; readonly hash: string | undefined }
  | { readonly type: 'showFile'; readonly path: string | undefined }
  | { readonly type: 'showEntireFile'; readonly entire: boolean }
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
    entireFile: false,
    patch: '',
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
): boolean {
  return state.selectionKnown && (hash !== state.hash || path !== state.path);
}

export function reduceTabView(state: TabView, action: TabAction): TabView {
  switch (action.type) {
    case 'tabs':
      return action.active === state.root
        ? state
        : { ...emptyTabView, root: action.active };
    case 'showCommit':
      return selected(state, action.hash);
    case 'showEntireFile':
      return { ...state, entireFile: action.entire };
    case 'showFile':
      return {
        ...state,
        path: action.path,
        entireFile: action.path === state.path && state.entireFile,
        selectionKnown: true,
        patchLoading: state.hash !== undefined,
        patch: '',
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
        state.history.release(action.start);
        return state;
      }
      state.history.add(action.start, action.commits, action.graph);
      return action.commits.some((commit) => commit.hash === state.hash)
        ? { ...state }
        : state;
    case 'unselect':
      return selected(state, undefined);
    case 'reveal':
      state.history?.locate(
        comparedOf(action.hash)?.to ?? action.hash,
        action.index,
      );
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
        texts: new Map(),
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
      return isLate(state, action.hash, state.path)
        ? state
        : { ...state, tree: action };
    case 'requestTree':
      return { ...state, treeRequested: action.hash };
    case 'fetching':
      return { ...state, fetching: action.running };
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
