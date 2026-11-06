import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import type { CloneView } from '../shared/clone';
import type {
  Bookmark,
  CompareView,
  DiffLayout,
  GitToHost,
  GitToWebview,
  GitToWebviewOf,
  LastFetch,
  RepositoryInfo,
  TabMessage,
  TextRequest,
  WorktreeInfo,
} from '../shared/protocol';
import { bookmarkedCommits } from '../shared/refNames';
import type { ChosenFolder, CloneTarget } from './clonePopup';
import { resetWidth, widthsToLoad } from './columns';
import { textKey, type LoadedText } from './diff';
import { tagsOnRemote } from './tagPushes';
import {
  emptyTabView,
  reduceTabView,
  type TabAction,
  type TabView,
} from './tabView';

interface ComparedTexts {
  readonly tab: string | undefined;
  readonly texts: ReadonlyMap<string, LoadedText>;
}

interface Cloning {
  readonly view: CloneView | undefined;
  readonly form: number;
  readonly folder: ChosenFolder | undefined;
  readonly target: CloneTarget | undefined;
}

interface GitSource {
  readonly tab: TabView;
  readonly worktrees: readonly WorktreeInfo[] | undefined;
  readonly bookmarks: readonly Bookmark[];
  readonly hideDimmed: boolean;
  readonly columnWidths: readonly number[];
  readonly defaultColumnWidths: readonly number[];
  readonly collapseMerges: boolean;
  readonly showEntireFile: boolean;
  readonly ignoreWhitespace: boolean;
  readonly diffLayout: DiffLayout;
  readonly showAllFiles: boolean;
  readonly autoFetch: boolean;
  readonly autoFetchMinutes: number;
  readonly solo: boolean;
  readonly compare: CompareView | undefined;
  readonly compareTexts: ComparedTexts;
  readonly recent: readonly RepositoryInfo[];
  readonly initAsked: GitToWebviewOf<'confirmInit'> | undefined;
  readonly clone: Cloning;
  readonly lastFetch: LastFetch;
  readonly commitsShown: boolean;
  readonly searching: boolean;
}

interface GitCollections {
  readonly bookmarked: ReadonlySet<string>;
  readonly tagsOnRemote: ReadonlySet<string>;
  readonly elsewhere: ReadonlySet<string>;
}

interface GitActions {
  readonly receive: (message: GitToWebview) => void;
  readonly dispatch: (action: TabAction) => void;
  readonly changeBookmarks: (bookmarks: readonly Bookmark[]) => void;
  readonly pull: () => void;
  readonly push: () => void;
  readonly pullBranch: (name: string) => void;
  readonly pushBranch: (name: string) => void;
  readonly pushTag: (name: string) => void;
  readonly changeShowEntireFile: (show: boolean) => void;
  readonly changeIgnoreWhitespace: (ignore: boolean) => void;
  readonly changeDiffLayout: (layout: DiffLayout) => void;
  readonly changeShowAllFiles: (show: boolean) => void;
  readonly changeCollapseMerges: (collapse: boolean) => void;
  readonly changeAutoFetch: (on: boolean) => void;
  readonly changeSolo: (solo: boolean) => void;
  readonly resizeColumns: (widths: readonly number[]) => void;
  readonly resetColumn: (index: number) => void;
  readonly loadCompareTexts: (requests: readonly TextRequest[]) => void;
  readonly forgetRecent: (root: string) => void;
  readonly answerInit: (confirmed: boolean) => void;
  readonly closeClone: () => void;
  readonly toggleCommits: () => void;
  readonly search: (open: boolean) => void;
}

const gitDefaults: GitSource = {
  tab: emptyTabView,
  worktrees: undefined,
  bookmarks: [],
  hideDimmed: false,
  columnWidths: [],
  defaultColumnWidths: [],
  collapseMerges: false,
  showEntireFile: false,
  ignoreWhitespace: false,
  diffLayout: 'sideBySide',
  showAllFiles: false,
  autoFetch: false,
  autoFetchMinutes: 0,
  solo: false,
  compare: undefined,
  compareTexts: { tab: undefined, texts: new Map() },
  recent: [],
  initAsked: undefined,
  clone: { view: undefined, form: 0, folder: undefined, target: undefined },
  lastFetch: {},
  commitsShown: true,
  searching: false,
};

type GitData = GitSource & GitCollections;

type GitState = GitData & GitActions;

const noNames: ReadonlySet<string> = new Set();

function remoteTagsOf({ repository }: TabView): ReadonlySet<string> {
  return repository?.tagRemote === undefined
    ? noNames
    : tagsOnRemote(repository.refs, repository.tagRemote);
}

function elsewhereOf({ worktrees, tab }: GitSource): ReadonlySet<string> {
  return new Set(
    (worktrees ?? [])
      .filter((worktree) => worktree.root !== tab.root)
      .map((worktree) => worktree.name),
  );
}

function collected<T extends GitSource>(
  source: T,
  before?: GitData,
): T & GitCollections {
  return {
    ...source,
    bookmarked:
      before?.bookmarks === source.bookmarks
        ? before.bookmarked
        : bookmarkedCommits(source.bookmarks),
    tagsOnRemote:
      before !== undefined && before.tab.repository === source.tab.repository
        ? before.tagsOnRemote
        : remoteTagsOf(source.tab),
    elsewhere:
      before !== undefined &&
      before.worktrees === source.worktrees &&
      before.tab.root === source.tab.root
        ? before.elsewhere
        : elsewhereOf(source),
  };
}

function withTab(state: GitState, action: TabAction): GitState {
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

function cloned(clone: Cloning, view: CloneView | undefined): Cloning {
  return view?.kind === 'form'
    ? { ...clone, view, form: clone.form + 1, folder: undefined }
    : { ...clone, view };
}

function received(state: GitState, message: GitToWebview): GitState {
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
      return { ...state, compare: message.compare };
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
      return { ...state, clone: { ...state.clone, target: message } };
    case 'lastFetch':
      return { ...state, lastFetch: message };
    default:
      return withTab(state, message);
  }
}

export function createGitStore(
  post: (message: GitToHost) => void,
  initial: Partial<GitSource> = {},
): StoreApi<GitState> {
  return createStore<GitState>()((set, get) => {
    const apply = (next: (state: GitState) => GitState) =>
      set((state) => {
        const changed = next(state);
        return changed === state ? state : collected(changed, state);
      });
    const postTab = (message: TabMessage) => {
      const { root } = get().tab;
      if (root !== undefined) {
        post({ ...message, root });
      }
    };
    return {
      ...collected({ ...gitDefaults, ...initial }),
      receive: (message) => apply((state) => received(state, message)),
      dispatch: (action) => apply((state) => withTab(state, action)),
      changeBookmarks: (bookmarks) => {
        apply((state) => ({ ...state, bookmarks }));
        postTab({ type: 'setBookmarks', bookmarks });
      },
      pull: () => postTab({ type: 'pull' }),
      push: () => postTab({ type: 'push' }),
      pullBranch: (name) => postTab({ type: 'pullBranch', name }),
      pushBranch: (name) => postTab({ type: 'pushBranch', name }),
      pushTag: (name) => postTab({ type: 'pushTag', name }),
      changeShowEntireFile: (show) => {
        set({ showEntireFile: show });
        post({ type: 'setShowEntireFile', show });
      },
      changeIgnoreWhitespace: (ignore) => {
        set({ ignoreWhitespace: ignore });
        post({ type: 'setIgnoreWhitespace', ignore });
      },
      changeDiffLayout: (layout) => {
        set({ diffLayout: layout });
        post({ type: 'setDiffLayout', layout });
      },
      changeShowAllFiles: (show) => {
        set({ showAllFiles: show });
        post({ type: 'setShowAllFiles', show });
      },
      changeCollapseMerges: (collapse) => {
        set({ collapseMerges: collapse });
        post({ type: 'setCollapseMerges', collapse });
      },
      changeAutoFetch: (on) => {
        set({ autoFetch: on });
        post({ type: 'setAutoFetch', on });
      },
      changeSolo: (solo) => {
        set({ solo });
        postTab({ type: 'setSolo', solo });
      },
      resizeColumns: (widths) => {
        set({ columnWidths: widths });
        post({ type: 'setColumnWidths', widths });
      },
      resetColumn: (index) => {
        const { columnWidths, defaultColumnWidths } = get();
        const widths = resetWidth(columnWidths, index, defaultColumnWidths);
        set({ columnWidths: widths });
        post({ type: 'setColumnWidths', widths });
      },
      loadCompareTexts: (requests) =>
        post({ type: 'loadCompareTexts', requests }),
      forgetRecent: (root) => {
        set((state) => ({
          recent: state.recent.filter((other) => other.root !== root),
        }));
        post({ type: 'forgetRecent', root });
      },
      answerInit: (confirmed) => {
        const { initAsked } = get();
        set({ initAsked: undefined });
        if (confirmed && initAsked !== undefined) {
          post({ type: 'initInside', folder: initAsked.folder });
        }
      },
      closeClone: () => {
        set((state) => ({ clone: { ...state.clone, view: undefined } }));
        post({ type: 'closeClone' });
      },
      toggleCommits: () =>
        set((state) => ({ commitsShown: !state.commitsShown })),
      search: (open) => set({ searching: open }),
    };
  });
}

export const GitStore = createContext(createGitStore(() => undefined));

export function useGit<T>(select: (state: GitState) => T): T {
  return useStore(useContext(GitStore), select);
}

export function useGitActions(): GitActions {
  return useContext(GitStore).getState();
}

export function detachedHead({ tab }: GitData): string | undefined {
  const { repository } = tab;
  return repository && !repository.head ? repository.headCommit : undefined;
}
