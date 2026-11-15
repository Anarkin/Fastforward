import { createContext, useContext } from 'react';
import { plainSearch } from '../../../lib/shared/searchOptions';
import { createStore, useStore, type StoreApi } from 'zustand';
import { strings } from '../../../lib/shared/strings';
import { compareWith } from '../shared/comparisons';
import type { GitToHost, GitToWebview, TabMessage } from '../shared/protocol';
import { toggleBookmark } from './bookmarks';
import { areaKey } from './changesRows';
import { resetWidth } from './columns';
import { parsePatch } from './diff';
import { foldersOf } from './fileTree';
import { settling } from './outbox';
import { startAfter } from './startAfter';
import { textsToLoad } from './textsToLoad';
import {
  noFolders,
  openFolders,
  replaceFolders,
  seeView,
  toggleFolder,
  type ViewFolders,
} from './viewFolders';
import { sameTextMeasures } from './textLayout';
import {
  gitDefaults,
  type GitActions,
  type GitSource,
  type GitState,
} from './gitState';
import {
  commitsShownOf,
  detachedHead,
  diffFindOf,
  folderViewOf,
  languageScopeOf,
} from './gitSelectors';
import { KeptPlaces } from './keptPlaces';
import type { KeptFocus } from '../../../lib/page/keptFocus';
import { diffPlaceKey, unplaced, type DiffPlace } from './diffPlace';
import { withEntry, withKey } from './tabKeyed';
import { collected } from './collections';
import { menuItemsOf } from './commitMenuItems';
import { checking, received, withTab } from './receivedMessages';

function foldersIn(state: GitState, root: string): ViewFolders {
  return state.folders.get(root) ?? noFolders;
}

function withFolders(
  state: GitState,
  root: string,
  folders: ViewFolders,
): GitState {
  return folders === foldersIn(state, root)
    ? state
    : { ...state, folders: withEntry(state.folders, root, folders) };
}

function withSeenView(state: GitState): GitState {
  const { root, hash } = state.tab;
  return root === undefined || hash === undefined
    ? state
    : withFolders(
        state,
        root,
        seeView(foldersIn(state, root), folderViewOf(state.tab)),
      );
}

function withSelectedFolders(state: GitState, before: GitState): GitState {
  const { path, area, root } = state.tab;
  const view = folderViewOf(state.tab);
  if (
    root === undefined ||
    !state.showAllFiles ||
    path === undefined ||
    (before.showAllFiles &&
      before.tab.path === path &&
      before.tab.area === area &&
      folderViewOf(before.tab) === view)
  ) {
    return state;
  }
  return withFolders(
    state,
    root,
    openFolders(
      foldersIn(state, root),
      view,
      foldersOf(path).map((folder) => areaKey(area, folder)),
    ),
  );
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
  const diffPlaces = new KeptPlaces<DiffPlace>();
  const focuses = new KeptPlaces<KeptFocus>();
  const filesScrolls = new KeptPlaces<number>();
  const locationScrolls = new KeptPlaces<number>();
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
      searchCommits: (query, options) =>
        startAfter(commitSearchDelay, () => {
          const { root } = get().tab;
          if (root === undefined) {
            return () => undefined;
          }
          post({ type: 'searchCommits', query, options, root });
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
      activateColumn: (column) =>
        set((state) => ({
          activeColumns: withEntry(state.activeColumns, state.tab.root, column),
        })),
      searchFor: (query, options) =>
        set((state) => {
          const { root } = state.tab;
          return root === undefined
            ? state
            : {
                searches: new Map(state.searches).set(root, {
                  query,
                  options:
                    options ?? state.searches.get(root)?.options ?? plainSearch,
                }),
              };
        }),
      filterFiles: (filter, options) =>
        set((state) => {
          const { root } = state.tab;
          if (root === undefined) {
            return state;
          }
          const fileFilters = new Map(state.fileFilters);
          if (filter === undefined) {
            fileFilters.delete(root);
          } else {
            fileFilters.set(root, {
              query: filter,
              options: options ?? fileFilters.get(root)?.options ?? plainSearch,
            });
          }
          return { fileFilters };
        }),
      toggleFolder: (kind, folder) =>
        set((state) => {
          const { root } = state.tab;
          return root === undefined
            ? state
            : withFolders(
                state,
                root,
                toggleFolder(
                  foldersIn(state, root),
                  folderViewOf(state.tab),
                  kind,
                  folder,
                ),
              );
        }),
      replaceFolders: (folders) =>
        set((state) => {
          const { root } = state.tab;
          return root === undefined
            ? state
            : withFolders(
                state,
                root,
                replaceFolders(folderViewOf(state.tab), folders),
              );
        }),
      foldFilesWhileFiltering: (folds) =>
        set((state) => ({
          fileFolds: withEntry(state.fileFolds, state.tab.root, folds),
        })),
      moveFilesCursor: (cursor) =>
        set((state) => ({
          fileCursors: withEntry(state.fileCursors, state.tab.root, cursor),
        })),
      pinMessage: (hash) =>
        set((state) => ({
          pinnedMessages: withEntry(state.pinnedMessages, state.tab.root, hash),
        })),
      filesScrollOf: (view) => filesScrolls.of(view),
      keepFilesScroll: (view, offset) => filesScrolls.keep(view, offset),
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
        set((state) => ({
          commitsHidden: withKey(
            state.commitsHidden,
            state.tab.root,
            commitsShownOf(state),
          ),
        })),
      search: (open) =>
        set((state) => {
          const { root } = state.tab;
          if (!open && root !== undefined) {
            locationScrolls.forget(root);
          }
          return {
            searching: withKey(state.searching, root, open),
            ...(!open && {
              locations: withEntry(state.locations, root, undefined),
            }),
          };
        }),
      keepLocations: (kept) =>
        set((state) => ({
          locations: withEntry(state.locations, state.tab.root, kept),
        })),
      locationsScrollOf: () => {
        const { root } = get().tab;
        return root === undefined ? undefined : locationScrolls.of(root);
      },
      keepLocationsScroll: (offset) => {
        const { root } = get().tab;
        if (root !== undefined) {
          locationScrolls.keep(root, offset);
        }
      },
      checkout: (target) => postTab({ type: 'checkout', target }),
      toggleBookmark: (bookmark) =>
        get().changeBookmarks(toggleBookmark(get().bookmarks, bookmark)),
      menuItems: (target) => {
        const state = get();
        const { repository } = state.tab;
        return menuItemsOf(
          target,
          repository?.refs ?? [],
          repository?.head,
          detachedHead(state),
          state.bookmarks,
          state.checkout,
          state.toggleBookmark,
        );
      },
      keepDiffFind: (scope, find) =>
        set((state) => ({
          diffFinds: withEntry(state.diffFinds, scope, find),
        })),
      closeDiffFind: (scope) =>
        set((state) => ({
          diffFinds: withEntry(state.diffFinds, scope, {
            finding: false,
            search: {
              query: '',
              options: diffFindOf(scope)(state).search.options,
            },
          }),
        })),
      keptFocusOf: (scope) => focuses.of(scope),
      keepFocus: (scope, focus) =>
        focus === undefined
          ? focuses.forget(scope)
          : focuses.keep(scope, focus),
      diffPlaceOf: (scope, selection) =>
        diffPlaces.of(diffPlaceKey(scope, selection)),
      keepDiffPlace: (scope, selection, change) => {
        const key = diffPlaceKey(scope, selection);
        diffPlaces.keep(key, {
          ...(diffPlaces.of(key) ?? unplaced),
          ...change,
        });
      },
      seeLanguageKey: (key) =>
        set((state) => {
          const scope = key === undefined ? undefined : languageScopeOf(key);
          const picked =
            scope === undefined ? undefined : state.pickedLanguages.get(scope);
          return picked === undefined || picked.key === key
            ? state
            : {
                pickedLanguages: withEntry(
                  state.pickedLanguages,
                  scope,
                  undefined,
                ),
              };
        }),
      pickLanguage: (key, language) =>
        set((state) => ({
          pickedLanguages: withEntry(
            state.pickedLanguages,
            key === undefined ? undefined : languageScopeOf(key),
            key === undefined || language === undefined
              ? undefined
              : { key, language },
          ),
        })),
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
