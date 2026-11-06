import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { strings } from '../../../shared/strings';
import type { ContextMenuItem } from '../../../ui/contextMenu';
import type { CloneAsk, CloneView } from '../shared/clone';
import { compareWith } from '../shared/comparisons';
import type {
  Bookmark,
  ChangeArea,
  CheckoutTarget,
  Direction,
  CompareView,
  DiffLayout,
  GitToHost,
  GitToWebview,
  GitToWebviewOf,
  LastFetch,
  RefInfo,
  RepositoryInfo,
  TabMessage,
  TextRequest,
  WorktreeInfo,
} from '../shared/protocol';
import { bookmarkedCommits, hasRef } from '../shared/refNames';
import { bookmarkOptions, toggleBookmark } from './bookmarks';
import { checkoutCommit, checkoutOptions, checkoutRef } from './checkout';
import type { ChosenFolder, CloneTarget } from './clonePopup';
import { resetWidth, widthsToLoad } from './columns';
import { textKey, type LoadedText } from './diff';
import type { ViewedSource } from './images';
import type { MenuTarget } from './menus';
import { settling } from './outbox';
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
  readonly pickedLanguage:
    { readonly key: string; readonly language: string } | undefined;
}

interface GitCollections {
  readonly bookmarked: ReadonlySet<string>;
  readonly tagsOnRemote: ReadonlySet<string>;
  readonly elsewhere: ReadonlySet<string>;
  readonly refsByCommit: ReadonlyMap<string, readonly RefInfo[]>;
  readonly stashCommits: ReadonlySet<string>;
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
  readonly selectCommit: (
    next: string | undefined,
    replace?: boolean,
    repeat?: boolean,
  ) => void;
  readonly compareCommit: (added: string) => void;
  readonly selectFile: (path: string | undefined, area?: ChangeArea) => void;
  readonly navigate: (direction: Direction, steps: number) => void;
  readonly jump: (hash: string | undefined) => void;
  readonly showUpstream: () => void;
  readonly showParent: () => void;
  readonly lookupHash: (query: string) => void;
  readonly searchCommits: (query: string) => () => void;
  readonly fetch: () => void;
  readonly toggleMerge: (hash: string) => void;
  readonly scrolled: (
    root: string | undefined,
    hash: string,
    offset: number,
    report: number,
  ) => void;
  readonly loadCommits: (
    start: number,
    count: number,
    generation: number,
  ) => void;
  readonly loadFileDiff: (path: string) => void;
  readonly loadTexts: (requests: readonly TextRequest[]) => void;
  readonly viewFile: (source: ViewedSource) => void;
  readonly requestTree: (hash: string) => void;
  readonly openRepository: (root: string) => void;
  readonly browseRepositories: () => void;
  readonly openClone: () => void;
  readonly initRepository: () => void;
  readonly checkCloneTarget: (folder: string, name: string) => void;
  readonly chooseCloneFolder: (folder: string) => void;
  readonly startClone: (ask: CloneAsk) => void;
  readonly stopClone: () => void;
  readonly selectWorktree: (root: string) => void;
  readonly preloadWorktree: (root: string) => void;
  readonly toggleCommits: () => void;
  readonly search: (open: boolean) => void;
  readonly checkout: (target: CheckoutTarget) => void;
  readonly toggleBookmark: (bookmark: Bookmark) => void;
  readonly menuItems: (target: MenuTarget) => ContextMenuItem[];
  readonly pickLanguage: (
    key: string | undefined,
    language: string | undefined,
  ) => void;
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
  pickedLanguage: undefined,
};

export function compareLanguageKey(comparing: string): string {
  return JSON.stringify(['compare', comparing]);
}

export function fileLanguageKey(
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

function menuItemsOf(state: GitState, target: MenuTarget): ContextMenuItem[] {
  const { repository } = state.tab;
  const refs = repository?.refs ?? [];
  const head = repository?.head;
  const detached = detachedHead(state);
  const marked = (bookmark: Bookmark) => hasRef(state.bookmarks, bookmark);
  if (target.kind === 'commit') {
    return [
      {
        label: strings.commits.checkout,
        submenu: checkoutOptions(target.hash, refs, head, detached).map(
          (option) => ({
            label: option.label,
            disabled: option.disabled,
            onClick: () => state.checkout(option.target),
          }),
        ),
      },
      { separator: true },
      {
        label: strings.commits.bookmark,
        submenu: bookmarkOptions(target.hash, refs).map((option) => ({
          label: option.label,
          checked: marked(option.bookmark),
          onClick: () => state.toggleBookmark(option.bookmark),
        })),
      },
    ];
  }
  const { ref } = target;
  const option =
    ref.kind === 'commit'
      ? checkoutCommit(ref.name, detached)
      : checkoutRef(ref, refs, head, detached);
  return [
    {
      label: strings.commits.checkout,
      disabled: option.disabled,
      onClick: () => state.checkout(option.target),
    },
    { separator: true },
    {
      label: marked(ref)
        ? strings.commits.removeBookmark
        : strings.commits.addBookmark,
      onClick: () => state.toggleBookmark(ref),
    },
  ];
}

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
    ...(before !== undefined && before.tab.repository === source.tab.repository
      ? { refsByCommit: before.refsByCommit, stashCommits: before.stashCommits }
      : {
          refsByCommit: Map.groupBy(
            source.tab.repository?.refs ?? [],
            (info) => info.commit,
          ),
          stashCommits: new Set(
            source.tab.repository?.stashes.map((stash) => stash.commit),
          ),
        }),
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
  postToHost: (message: GitToHost) => void,
  initial: Partial<GitSource> = {},
): StoreApi<GitState> {
  const outbox = settling(postToHost);
  const post = outbox.send;
  let selections = 0;
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
    const passTab = (message: TabMessage) => {
      const { root } = get().tab;
      if (root !== undefined) {
        outbox.pass({ ...message, root });
      }
    };
    const withHash = (send: (hash: string, diff: number) => void) => {
      const { hash, diffs } = get().tab;
      if (hash !== undefined) {
        send(hash, diffs);
      }
    };
    const selectCommit = (
      next: string | undefined,
      replace = false,
      repeat = false,
    ) => {
      const { hash, root } = get().tab;
      const target = next === hash ? undefined : next;
      const selection = ++selections;
      apply((state) =>
        withTab(state, { type: 'showCommit', hash: target, selection }),
      );
      if (root !== undefined) {
        outbox.settle(
          { type: 'selectCommit', hash: target, replace, selection, root },
          repeat,
        );
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
      selectCommit,
      compareCommit: (added) => {
        const { hash } = get().tab;
        const next = compareWith(hash, added);
        if (next !== hash) {
          selectCommit(next);
        }
      },
      selectFile: (path, area) =>
        withHash((hash) => {
          apply((state) => withTab(state, { type: 'showFile', path, area }));
          postTab({ type: 'selectFile', hash, path, area });
        }),
      navigate: (direction, steps) =>
        postTab({ type: 'navigate', direction, steps }),
      jump: (hash) => {
        if (hash) {
          postTab({ type: 'jump', hash });
        }
      },
      showUpstream: () => postTab({ type: 'showUpstream' }),
      showParent: () => postTab({ type: 'showParent' }),
      lookupHash: (query) => postTab({ type: 'lookupHash', query }),
      searchCommits: (query) => {
        postTab({ type: 'searchCommits', query });
        return () => postTab({ type: 'stopCommitSearch' });
      },
      fetch: () => postTab({ type: 'fetch' }),
      toggleMerge: (hash) => postTab({ type: 'toggleMerge', hash }),
      scrolled: (root, hash, offset, report) => {
        if (root !== undefined) {
          outbox.pass({ type: 'scrolled', hash, offset, report, root });
        }
      },
      loadCommits: (start, count, generation) =>
        passTab({ type: 'loadCommits', generation, start, count }),
      loadFileDiff: (path) =>
        withHash((hash, diff) =>
          postTab({ type: 'loadFileDiff', hash, path, diff }),
        ),
      loadTexts: (requests) =>
        withHash((hash, diff) =>
          postTab({ type: 'loadTexts', hash, diff, texts: requests }),
        ),
      viewFile: (source) => postTab({ type: 'viewFile', ...source }),
      requestTree: (hash) => {
        apply((state) => withTab(state, { type: 'requestTree', hash }));
        const { root } = get().tab;
        if (root !== undefined) {
          outbox.follow({ type: 'loadTree', hash, root });
        }
      },
      openRepository: (root) => post({ type: 'openRepository', root }),
      browseRepositories: () => post({ type: 'browseRepositories' }),
      openClone: () => post({ type: 'openClone' }),
      initRepository: () => post({ type: 'initRepository' }),
      checkCloneTarget: (folder, name) =>
        post({ type: 'checkCloneTarget', folder, name }),
      chooseCloneFolder: (folder) =>
        post({ type: 'chooseCloneFolder', folder }),
      startClone: (ask) => post({ type: 'clone', ...ask }),
      stopClone: () => post({ type: 'stopClone' }),
      selectWorktree: (root) => post({ type: 'selectWorktree', root }),
      preloadWorktree: (root) => post({ type: 'preloadWorktree', root }),
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
      checkout: (target) => postTab({ type: 'checkout', target }),
      toggleBookmark: (bookmark) =>
        get().changeBookmarks(toggleBookmark(get().bookmarks, bookmark)),
      menuItems: (target) => menuItemsOf(get(), target),
      pickLanguage: (key, language) =>
        set({
          pickedLanguage:
            key === undefined || language === undefined
              ? undefined
              : { key, language },
        }),
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
