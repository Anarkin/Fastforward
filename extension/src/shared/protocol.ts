export const workingTreeHash = 'working-tree';
export const workingTreeIndex = -1;
export const workingTreeSubject = 'Uncommitted changes';

export type RefKind = 'branch' | 'remote' | 'tag';

export type HashLookup =
  | { readonly kind: 'found'; readonly hash: string; readonly subject: string }
  | { readonly kind: 'none' }
  | { readonly kind: 'ambiguous'; readonly count: number };

export interface NavigationEntry {
  readonly hash: string;
  readonly subject: string | undefined;
}

export type FilesMode = 'changes' | 'files';

export const collapseThreshold = 1500;

export function isLargeChange(file: {
  readonly insertions: number;
  readonly deletions: number;
}): boolean {
  return file.insertions + file.deletions > collapseThreshold;
}

export type ChangesView = 'list' | 'tree';

export const defaultLayout: {
  readonly collapseMerges: boolean;
  readonly solo: boolean;
  readonly filesMode: FilesMode;
  readonly changesView: ChangesView;
} = {
  collapseMerges: true,
  solo: false,
  filesMode: 'changes',
  changesView: 'tree',
};

export const commitPageSize = 100;

export function pageStart(index: number): number {
  return index - (index % commitPageSize);
}

export interface RefInfo {
  readonly kind: RefKind;
  readonly name: string;
  readonly commit: string;
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
  readonly message: string;
  readonly parents: readonly string[];
  readonly authorName: string;
  readonly authorEmail: string;
  // Milliseconds since the epoch, because Dates don't survive postMessage
  readonly authorDate: number;
  readonly committerName: string;
  readonly committerEmail: string;
  readonly commitDate: number;
  readonly files: number;
}

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
}

export interface FileChange {
  readonly path: string;
  readonly oldPath: string | undefined;
  readonly status: 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U' | '?';
  readonly insertions: number;
  readonly deletions: number;
}

export interface TabInfo {
  readonly root: string;
  readonly name: string;
}

export interface RepositoryState {
  readonly head: string | undefined;
  readonly headCommit: string | undefined;
  readonly headUpstream: string | undefined;
  readonly refs: readonly RefInfo[];
}

export type Direction = 'back' | 'forward';

export interface ScrollTarget {
  readonly index: number;
  readonly offset?: number;
}

export type ToExtension =
  | { readonly type: 'ready' }
  | { readonly type: 'selectTab'; readonly root: string }
  | { readonly type: 'addTab' }
  | { readonly type: 'closeTab'; readonly root: string }
  | { readonly type: 'sortTabs' }
  | { readonly type: 'preloadTab'; readonly root: string }
  | { readonly type: 'setColumnWidths'; readonly widths: readonly number[] }
  | { readonly type: 'setCollapseMerges'; readonly collapse: boolean }
  | { readonly type: 'setSolo'; readonly solo: boolean }
  | { readonly type: 'setFilesMode'; readonly mode: FilesMode }
  | { readonly type: 'setChangesView'; readonly view: ChangesView }
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
  | { readonly type: 'loadTree'; readonly hash: string }
  | {
      readonly type: 'loadFileDiff';
      readonly hash: string;
      readonly path: string;
      readonly diff: number;
    }
  | { readonly type: 'jump'; readonly hash: string }
  | { readonly type: 'checkout'; readonly target: CheckoutTarget }
  | { readonly type: 'fetch' }
  | { readonly type: 'lookupHash'; readonly query: string }
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
    }
  | {
      readonly type: 'selectFile';
      readonly hash: string;
      readonly path: string | undefined;
    };

export type ToWebview =
  | {
      readonly type: 'layout';
      readonly columnWidths: readonly number[] | undefined;
      readonly collapseMerges: boolean;
      readonly solo: boolean;
      readonly filesMode: FilesMode;
      readonly changesView: ChangesView;
    }
  | { readonly type: 'bookmarks'; readonly bookmarks: readonly Bookmark[] }
  | { readonly type: 'fetching'; readonly running: boolean }
  | {
      readonly type: 'hashLookup';
      readonly query: string;
      readonly result: HashLookup;
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
    }
  | ({ readonly type: 'repository' } & RepositoryState)
  | {
      readonly type: 'commits';
      readonly generation: number;
      readonly total: number;
      readonly decorations: readonly (readonly [number, number])[];
      readonly start: number;
      readonly commits: readonly CommitInfo[];
      readonly graph: readonly GraphRow[];
      readonly workingTreeGraph: GraphRow;
      readonly selectedIndex: number | undefined;
      readonly scrollTarget: ScrollTarget | undefined;
    }
  | {
      readonly type: 'commitPage';
      readonly generation: number;
      readonly start: number;
      readonly commits: readonly CommitInfo[];
      readonly graph: readonly GraphRow[];
    }
  | { readonly type: 'reveal'; readonly hash: string; readonly index: number }
  | { readonly type: 'workingTree'; readonly files: number }
  | {
      readonly type: 'files';
      readonly hash: string;
      readonly files: readonly FileChange[];
    }
  | {
      readonly type: 'diff';
      readonly hash: string;
      readonly path: string | undefined;
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
      readonly type: 'tree';
      readonly hash: string;
      readonly paths: readonly string[];
    }
  | {
      readonly type: 'fileContent';
      readonly hash: string;
      readonly path: string;
      readonly content: string;
      readonly binary: boolean;
    }
  | { readonly type: 'error'; readonly message: string };

export type ToWebviewOf<T extends ToWebview['type']> = Extract<
  ToWebview,
  { readonly type: T }
>;
