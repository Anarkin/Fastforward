export const workingTreeHash = 'working-tree';
export const workingTreeIndex = -1;

export type RefKind = 'branch' | 'remote' | 'tag';

export interface CommitResults {
  readonly commits: readonly CommitInfo[];
  readonly more: number;
}

export interface CommitSearch {
  readonly commits: readonly CommitInfo[];
  readonly capped: boolean;
}

export const diffLayouts = ['inline', 'sideBySide'] as const;

export type DiffLayout = (typeof diffLayouts)[number];

export interface NavigationEntry {
  readonly hash: string;
  readonly subject: string | undefined;
}

export const collapseThreshold = 1500;

export function isLargeChange(file: {
  readonly insertions: number;
  readonly deletions: number;
  readonly tooLargeToCount?: boolean;
}): boolean {
  return (
    file.tooLargeToCount === true ||
    file.insertions + file.deletions > collapseThreshold
  );
}

export const patchLineBudget = 20_000;

export const patchByteBudget = 16 * 1024 * 1024;

export const patchPathBudget = 16_000;

export function deferredChanges(
  files: readonly FileChange[],
): ReadonlySet<string> {
  const deferred = new Set<string>();
  let lines = 0;
  let paths = 0;
  let bytes = 0;
  let full = false;
  for (const file of files) {
    if (isLargeChange(file)) {
      deferred.add(file.path);
      continue;
    }
    lines += file.insertions + file.deletions;
    paths += file.path.length + (file.oldPath?.length ?? 0);
    bytes += file.bytes ?? 0;
    full ||=
      lines > patchLineBudget ||
      paths > patchPathBudget ||
      bytes > patchByteBudget;
    if (full) {
      deferred.add(file.path);
    }
  }
  return deferred;
}

export const commitPageSize = 100;

export function pageStart(index: number): number {
  return index - (index % commitPageSize);
}

export interface RefInfo {
  readonly kind: RefKind;
  readonly name: string;
  readonly commit: string;
  readonly remote?: string;
}

export interface StashInfo {
  readonly name: string;
  readonly commit: string;
  readonly message: string;
}

export type CheckoutTarget =
  | { readonly kind: RefKind; readonly name: string }
  | { readonly kind: 'commit'; readonly hash: string };

export interface BookmarkRef {
  readonly kind: RefKind;
  readonly name: string;
}

interface BookmarkCommit {
  readonly kind: 'commit';
  readonly name: string;
}

export type Bookmark = BookmarkRef | BookmarkCommit;

export interface CommitInfo {
  readonly hash: string;
  readonly subject: string;
  readonly authorName: string;
  readonly commitDate: number;
}

export const maxLanes = 12;
export const graphColors = 8;

export interface GraphLine {
  readonly from: number;
  readonly to: number;
  readonly color: number;
  readonly bottom: boolean;
  readonly dashed?: boolean;
}

export interface GraphRow {
  readonly lane: number;
  readonly color: number;
  readonly lines: readonly GraphLine[];
  readonly merge?: 'collapsed' | 'expanded';
  readonly hidden?: number;
  readonly workingTree?: boolean;
  readonly stash?: boolean;
}

export type ChangeArea = 'staged' | 'unstaged';

export interface FileChange {
  readonly path: string;
  readonly oldPath: string | undefined;
  readonly status: 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U' | '?';
  readonly insertions: number;
  readonly deletions: number;
  readonly bytes?: number;
  readonly tooLargeToCount?: boolean;
}

export interface TabInfo {
  readonly root: string;
  readonly name: string;
}

export interface WorktreeInfo {
  readonly root: string;
  readonly name: string;
  readonly folder: string;
  readonly main: boolean;
  readonly missing: boolean;
}

export interface RepositoryState {
  readonly head: string | undefined;
  readonly headCommit: string | undefined;
  readonly refs: readonly RefInfo[];
  readonly stashes: readonly StashInfo[];
}

export type Direction = 'back' | 'forward';

export interface ScrollTarget {
  readonly index: number;
  readonly offset?: number;
}

export interface TextRequest {
  readonly path: string;
  readonly side: 'old' | 'new';
  readonly blob: string;
}

export type ToHost =
  | { readonly type: 'ready' }
  | { readonly type: 'selectTab'; readonly root: string }
  | { readonly type: 'openRepository'; readonly root: string }
  | { readonly type: 'browseRepositories' }
  | { readonly type: 'openSettings' }
  | { readonly type: 'openDefaultSettings' }
  | { readonly type: 'closeTab'; readonly root: string }
  | { readonly type: 'sortTabs' }
  | { readonly type: 'preloadTab'; readonly root: string }
  | { readonly type: 'selectWorktree'; readonly root: string }
  | { readonly type: 'preloadWorktree'; readonly root: string }
  | { readonly type: 'setColumnWidths'; readonly widths: readonly number[] }
  | { readonly type: 'setCollapseMerges'; readonly collapse: boolean }
  | { readonly type: 'pinEntireFile'; readonly pinned: boolean }
  | { readonly type: 'setIgnoreWhitespace'; readonly ignore: boolean }
  | { readonly type: 'setWordWrap'; readonly wrap: boolean }
  | { readonly type: 'setDiffLayout'; readonly layout: DiffLayout }
  | { readonly type: 'setShowAllFiles'; readonly show: boolean }
  | { readonly type: 'setAutoFetch'; readonly on: boolean }
  | {
      readonly type: 'log';
      readonly level: 'info' | 'error';
      readonly message: string;
    }
  | (TabMessage & {
      readonly root: string;
    });

export type TabMessage =
  | { readonly type: 'setBookmarks'; readonly bookmarks: readonly Bookmark[] }
  | { readonly type: 'setSolo'; readonly solo: boolean }
  | { readonly type: 'showEntireFile'; readonly entire: boolean }
  | { readonly type: 'loadTree'; readonly hash: string }
  | { readonly type: 'showUpstream' }
  | { readonly type: 'showParent' }
  | {
      readonly type: 'loadFileDiff';
      readonly hash: string;
      readonly path: string;
      readonly diff: number;
    }
  | {
      readonly type: 'loadTexts';
      readonly hash: string;
      readonly diff: number;
      readonly texts: readonly TextRequest[];
    }
  | { readonly type: 'jump'; readonly hash: string }
  | { readonly type: 'checkout'; readonly target: CheckoutTarget }
  | { readonly type: 'fetch' }
  | { readonly type: 'lookupHash'; readonly query: string }
  | { readonly type: 'searchCommits'; readonly query: string }
  | {
      readonly type: 'navigate';
      readonly direction: Direction;
      readonly steps: number;
    }
  | {
      readonly type: 'loadCommits';
      readonly generation: number;
      readonly start: number;
    }
  | {
      readonly type: 'scrolled';
      readonly hash: string;
      readonly offset: number;
    }
  | { readonly type: 'toggleMerge'; readonly hash: string }
  | {
      readonly type: 'selectCommit';
      readonly hash: string | undefined;
      readonly replace?: boolean;
      readonly selection?: number;
    }
  | {
      readonly type: 'selectFile';
      readonly hash: string;
      readonly path: string | undefined;
      readonly area?: ChangeArea;
    };

export type ToWebview =
  | {
      readonly type: 'layout';
      readonly columnWidths: readonly number[];
      readonly defaultColumnWidths: readonly number[];
      readonly collapseMerges: boolean;
      readonly entireFilePinned: boolean;
      readonly ignoreWhitespace: boolean;
      readonly wordWrap: boolean;
      readonly diffLayout: DiffLayout;
      readonly showAllFiles: boolean;
      readonly autoFetch: boolean;
      readonly autoFetchMinutes: number;
    }
  | { readonly type: 'bookmarks'; readonly bookmarks: readonly Bookmark[] }
  | { readonly type: 'solo'; readonly solo: boolean }
  | { readonly type: 'fetching'; readonly running: boolean }
  | { readonly type: 'applyingSolo'; readonly running: boolean }
  | {
      readonly type: 'hashLookup';
      readonly query: string;
      readonly result: CommitResults;
    }
  | {
      readonly type: 'commitSearch';
      readonly query: string;
      readonly result: CommitSearch;
    }
  | {
      readonly type: 'navigation';
      readonly back: readonly NavigationEntry[];
      readonly forward: readonly NavigationEntry[];
    }
  | {
      readonly type: 'tabs';
      readonly tabs: readonly TabInfo[];
      readonly active: string | undefined;
      readonly worktree: string | undefined;
      readonly worktrees: readonly WorktreeInfo[] | undefined;
      readonly recent: readonly TabInfo[];
    }
  | ({ readonly type: 'repository' } & RepositoryState)
  | {
      readonly type: 'commits';
      readonly generation: number;
      readonly total: number;
      readonly decorations: readonly number[];
      readonly start: number;
      readonly commits: readonly CommitInfo[];
      readonly graph: readonly GraphRow[];
      readonly workingTreeGraph: GraphRow;
      readonly selectedIndex: number | undefined;
      readonly keysFrom?: number;
      readonly scrollTarget: ScrollTarget | undefined;
    }
  | {
      readonly type: 'commitPage';
      readonly generation: number;
      readonly start: number;
      readonly commits: readonly CommitInfo[];
      readonly graph: readonly GraphRow[];
    }
  | {
      readonly type: 'reveal';
      readonly hash: string;
      readonly index: number;
      readonly selection?: number;
    }
  | { readonly type: 'unselect'; readonly selection?: number }
  | { readonly type: 'workingTree'; readonly files: number }
  | {
      readonly type: 'files';
      readonly hash: string;
      readonly files: readonly FileChange[];
      readonly staged?: readonly FileChange[];
    }
  | {
      readonly type: 'diff';
      readonly hash: string;
      readonly path: string | undefined;
      readonly area?: ChangeArea;
      readonly patch: string;
    }
  | {
      readonly type: 'fileDiff';
      readonly hash: string;
      readonly path: string;
      readonly patch: string;
      readonly diff: number;
    }
  | {
      readonly type: 'texts';
      readonly hash: string;
      readonly diff: number;
      readonly texts: readonly (TextRequest & {
        readonly text: string | undefined;
      })[];
    }
  | {
      readonly type: 'tree';
      readonly hash: string;
      readonly paths: readonly string[];
    }
  | {
      readonly type: 'fileContent';
      readonly hash: string;
      readonly path: string;
      readonly area?: ChangeArea;
      readonly content: string;
      readonly binary: boolean;
    }
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'clearError'; readonly message: string }
  | {
      readonly type: 'notice';
      readonly level: 'info' | 'error';
      readonly message: string;
    };

export type ToWebviewOf<T extends ToWebview['type']> = Extract<
  ToWebview,
  { readonly type: T }
>;
