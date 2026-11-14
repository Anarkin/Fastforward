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
import type { ColumnName } from './activeColumn';
import { bookmarkOptions, toggleBookmark } from './bookmarks';
import { areaKey } from './changesTree';
import { checkoutCommit, checkoutOptions, checkoutRef } from './checkout';
import type { ChosenFolder, CloneTarget } from './clonePopup';
import { resetWidth, shownSelection, widthsToLoad } from './columns';
import { parsePatch, textKey, type LoadedText } from './diff';
import { foldersOf } from './fileTree';
import type { ViewedSource } from './images';
import type { MenuTarget } from './menus';
import { settling } from './outbox';
import { indexRefs, type RefGroup } from './refIndex';
import { startAfter } from './startAfter';
import { textsToLoad } from './syntax';
import { tagsOnRemote } from './tagPushes';
import {
  noFolders,
  openFolders,
  replaceFolders,
  seeView,
  shownFolders,
  toggleFolder,
  type Folders,
  type ViewFolders,
} from './viewFolders';
import {
  emptyTabView,
  reduceTabView,
  type TabAction,
  type TabView,
} from './tabView';
import type { WrapColumns } from './rowMeasures';
import type { CodeSnap, TextMeasures } from './textProbes';

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
  readonly activeColumn: ColumnName;
  readonly fileFilters: ReadonlyMap<string, string>;
  readonly searchQueries: ReadonlyMap<string, string>;
  readonly folders: ViewFolders;
  readonly diffText: TextMeasures | undefined;
  readonly diffSnap: CodeSnap;
  readonly wrapColumns: WrapColumns | undefined;
}

interface GitCollections {
  readonly bookmarked: ReadonlySet<string>;
  readonly tagsOnRemote: ReadonlySet<string>;
  readonly elsewhere: ReadonlySet<string>;
  readonly refsByCommit: ReadonlyMap<string, readonly RefInfo[]>;
  readonly stashCommits: ReadonlySet<string>;
  readonly refIndex: readonly RefGroup[];
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
  readonly lookupHash: (query: string) => () => void;
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
  readonly checkCloneTarget: (folder: string, name: string) => () => void;
  readonly chooseCloneFolder: (folder: string) => void;
  readonly startClone: (ask: CloneAsk) => void;
  readonly stopClone: () => void;
  readonly selectWorktree: (root: string) => void;
  readonly preloadWorktree: (root: string) => void;
  readonly activateColumn: (column: ColumnName) => void;
  readonly filterFiles: (filter: string | undefined) => void;
  readonly searchFor: (query: string) => void;
  readonly toggleFolder: (kind: keyof Folders, folder: string) => void;
  readonly replaceFolders: (folders: Folders) => void;
  readonly toggleCommits: () => void;
  readonly search: (open: boolean) => void;
  readonly checkout: (target: CheckoutTarget) => void;
  readonly toggleBookmark: (bookmark: Bookmark) => void;
  readonly menuItems: (target: MenuTarget) => ContextMenuItem[];
  readonly pickLanguage: (
    key: string | undefined,
    language: string | undefined,
  ) => void;
  readonly seeLanguageKey: (key: string | undefined) => void;
  readonly measureDiffText: (measures: TextMeasures) => void;
  readonly snapDiffCode: (snap: (last: CodeSnap) => CodeSnap) => void;
  readonly keepWrapColumns: (columns: WrapColumns) => void;
}

const noComparedTexts: ComparedTexts = { tab: undefined, texts: new Map() };

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
  compareTexts: noComparedTexts,
  recent: [],
  initAsked: undefined,
  clone: { view: undefined, form: 0, folder: undefined, target: undefined },
  lastFetch: {},
  commitsShown: true,
  searching: false,
  pickedLanguage: undefined,
  activeColumn: 'commits',
  fileFilters: new Map(),
  searchQueries: new Map(),
  folders: noFolders,
  diffText: undefined,
  diffSnap: { inline: 0, left: 0, right: 0 },
  wrapColumns: undefined,
};

function sameTextMeasures(
  one: TextMeasures | undefined,
  other: TextMeasures,
): boolean {
  return (
    one !== undefined &&
    one.charWidth === other.charWidth &&
    one.font === other.font &&
    one.spacing === other.spacing &&
    one.scale === other.scale &&
    one.lineHeight === other.lineHeight &&
    one.padding.top === other.padding.top &&
    one.padding.bottom === other.padding.bottom
  );
}

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

export function folderViewOf({ root, hash }: TabView): string {
  return JSON.stringify([root, hash]);
}

export function shownFoldersOf(state: GitSource): Folders {
  return shownFolders(state.folders, folderViewOf(state.tab));
}

export function searchQueryOf({ tab, searchQueries }: GitSource): string {
  return tab.root === undefined ? '' : (searchQueries.get(tab.root) ?? '');
}

export function fileFilterOf({
  tab,
  fileFilters,
}: GitSource): string | undefined {
  return tab.root === undefined ? undefined : fileFilters.get(tab.root);
}

function withSeenView(state: GitState): GitState {
  const folders = seeView(state.folders, folderViewOf(state.tab));
  return folders === state.folders ? state : { ...state, folders };
}

function withSelectedFolders(state: GitState, before: GitState): GitState {
  const { path, area } = state.tab;
  const view = folderViewOf(state.tab);
  if (
    !state.showAllFiles ||
    path === undefined ||
    (before.showAllFiles &&
      before.tab.path === path &&
      before.tab.area === area &&
      folderViewOf(before.tab) === view)
  ) {
    return state;
  }
  const folders = openFolders(
    state.folders,
    view,
    foldersOf(path).map((folder) => areaKey(area, folder)),
  );
  return folders === state.folders ? state : { ...state, folders };
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

export type GitState = GitData & GitActions;

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
      ? {
          refsByCommit: before.refsByCommit,
          stashCommits: before.stashCommits,
          refIndex: before.refIndex,
        }
      : {
          refsByCommit: Map.groupBy(
            source.tab.repository?.refs ?? [],
            (info) => info.commit,
          ),
          stashCommits: new Set(
            source.tab.repository?.stashes.map((stash) => stash.commit),
          ),
          refIndex: indexRefs(source.tab.repository?.refs ?? []),
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

function isTarget(
  target: CloneTarget | undefined,
  { folder, name }: CloneTarget,
): boolean {
  return target?.folder === folder && target.name === name;
}

function checking(clone: Cloning, target: CloneTarget): Cloning {
  return isTarget(clone.target, target) ? clone : { ...clone, target };
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

const hashLookupDelay = 150;

const commitSearchDelay = 250;

const cloneCheckDelay = 150;

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
        return changed === state
          ? state
          : collected(withSelectedFolders(withSeenView(changed), state), state);
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
    let step = 1;
    const readAhead = (message: GitToWebview) => {
      const { hash, history, prefetched } = get().tab;
      if (
        message.type === 'diff' &&
        message.path === undefined &&
        message.hash === hash
      ) {
        const position = history?.positionOf(hash);
        const next =
          position === undefined ? undefined : history?.at(position + step);
        if (next !== undefined && prefetched?.hash !== next.hash) {
          postTab({ type: 'prefetchDiff', hash: next.hash });
        }
      } else if (
        message.type === 'prefetchedDiff' &&
        prefetched?.hash === message.hash
      ) {
        const texts = textsToLoad(parsePatch(message.patch), 0, new Set());
        if (texts.length > 0) {
          postTab({ type: 'prefetchTexts', hash: message.hash, texts });
        }
      }
    };
    const selectCommit = (
      next: string | undefined,
      replace = false,
      repeat = false,
    ) => {
      const { hash, root, history } = get().tab;
      const target = next === hash ? undefined : next;
      const from = hash === undefined ? undefined : history?.positionOf(hash);
      const to = next === undefined ? undefined : history?.positionOf(next);
      if (from !== undefined && to !== undefined && to !== from) {
        step = Math.sign(to - from);
      }
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
      receive: (message) => {
        apply((state) => received(state, message));
        readAhead(message);
      },
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
      lookupHash: (query) =>
        startAfter(hashLookupDelay, () => {
          postTab({ type: 'lookupHash', query });
          return () => undefined;
        }),
      searchCommits: (query) =>
        startAfter(commitSearchDelay, () => {
          const { root } = get().tab;
          if (root === undefined) {
            return () => undefined;
          }
          post({ type: 'searchCommits', query, root });
          return () => post({ type: 'stopCommitSearch', root });
        }),
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
      checkCloneTarget: (folder, name) => {
        set((state) => ({ clone: checking(state.clone, { folder, name }) }));
        return startAfter(cloneCheckDelay, () => {
          post({ type: 'checkCloneTarget', folder, name });
          return () => undefined;
        });
      },
      chooseCloneFolder: (folder) =>
        post({ type: 'chooseCloneFolder', folder }),
      startClone: (ask) => post({ type: 'clone', ...ask }),
      stopClone: () => post({ type: 'stopClone' }),
      selectWorktree: (root) => post({ type: 'selectWorktree', root }),
      preloadWorktree: (root) => post({ type: 'preloadWorktree', root }),
      activateColumn: (column) => set({ activeColumn: column }),
      searchFor: (query) =>
        set((state) => {
          const { root } = state.tab;
          return root === undefined
            ? state
            : { searchQueries: new Map(state.searchQueries).set(root, query) };
        }),
      filterFiles: (filter) =>
        set((state) => {
          const { root } = state.tab;
          if (root === undefined) {
            return state;
          }
          const fileFilters = new Map(state.fileFilters);
          if (filter === undefined) {
            fileFilters.delete(root);
          } else {
            fileFilters.set(root, filter);
          }
          return { fileFilters };
        }),
      toggleFolder: (kind, folder) =>
        set((state) => ({
          folders: toggleFolder(
            state.folders,
            folderViewOf(state.tab),
            kind,
            folder,
          ),
        })),
      replaceFolders: (folders) =>
        set((state) => ({
          folders: replaceFolders(folderViewOf(state.tab), folders),
        })),
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
        apply((state) => ({ ...state, showAllFiles: show }));
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
      seeLanguageKey: (key) =>
        set((state) =>
          state.pickedLanguage === undefined || state.pickedLanguage.key === key
            ? state
            : { pickedLanguage: undefined },
        ),
      pickLanguage: (key, language) =>
        set({
          pickedLanguage:
            key === undefined || language === undefined
              ? undefined
              : { key, language },
        }),
      measureDiffText: (measures) =>
        set((state) =>
          sameTextMeasures(state.diffText, measures)
            ? state
            : { diffText: measures },
        ),
      snapDiffCode: (snap) =>
        set((state) => {
          const next = snap(state.diffSnap);
          return next === state.diffSnap ? state : { diffSnap: next };
        }),
      keepWrapColumns: (columns) =>
        set((state) =>
          state.wrapColumns?.left === columns.left &&
          state.wrapColumns.right === columns.right
            ? state
            : { wrapColumns: columns },
        ),
    };
  });
}

export const GitStore = createContext<StoreApi<GitState> | undefined>(
  undefined,
);

function useGitStore(): StoreApi<GitState> {
  const store = useContext(GitStore);
  if (store === undefined) {
    throw new Error(strings.errors.storeOutsideProvider('git'));
  }
  return store;
}

export function useGit<T>(select: (state: GitState) => T): T {
  return useStore(useGitStore(), select);
}

export function useGitActions(): GitActions {
  return useGitStore().getState();
}

export function detachedHead({ tab }: GitData): string | undefined {
  const { repository } = tab;
  return repository && !repository.head ? repository.headCommit : undefined;
}
