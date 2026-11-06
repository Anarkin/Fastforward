import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import type {
  Bookmark,
  GitToHost,
  GitToWebview,
  TabMessage,
  WorktreeInfo,
} from '../shared/protocol';
import { bookmarkedCommits } from '../shared/refNames';
import { tagsOnRemote } from './tagPushes';
import {
  emptyTabView,
  reduceTabView,
  type TabAction,
  type TabView,
} from './tabView';

interface GitSource {
  readonly tab: TabView;
  readonly worktrees: readonly WorktreeInfo[] | undefined;
  readonly bookmarks: readonly Bookmark[];
  readonly hideDimmed: boolean;
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
  };
}

function withTab(state: GitState, action: TabAction): GitState {
  const tab = reduceTabView(state.tab, action);
  return tab === state.tab ? state : { ...state, tab };
}

function received(state: GitState, message: GitToWebview): GitState {
  switch (message.type) {
    case 'worktrees':
      return { ...withTab(state, message), worktrees: message.worktrees };
    case 'bookmarks':
      return { ...state, bookmarks: message.bookmarks };
    case 'layout':
      return { ...state, hideDimmed: message.hideDimmedButtons };
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
      ...collected({
        tab: emptyTabView,
        worktrees: undefined,
        bookmarks: [],
        hideDimmed: false,
        ...initial,
      }),
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
