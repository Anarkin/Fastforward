// Messages between the extension and the view's webview

// Selecting this instead of a commit hash shows the uncommitted changes
export const workingTreeHash = 'working-tree';

export type RefKind = 'branch' | 'remote' | 'tag';

// Fetch updates every remote branch and drops the deleted ones
export type SyncAction = 'pull' | 'push' | 'fetch';

// What a hash typed in the address bar is: one commit, none, or too short
// to tell which of several
export type HashLookup =
  | { readonly kind: 'found'; readonly hash: string; readonly subject: string }
  | { readonly kind: 'none' }
  | { readonly kind: 'ambiguous'; readonly count: number };

// A commit in a tab's back or forward history
export interface NavigationEntry {
  readonly hash: string;
  // Undefined for a commit that isn't loaded
  readonly subject: string | undefined;
}

// What the Files column lists: the selected commit's changes, or every file
// of the repository at it
export type FilesMode = 'changes' | 'files';

// Files with more changed lines than this start collapsed in the Diff column,
// and the diff of a whole commit leaves them out until one is opened, as they
// are slow to fetch, send and draw, and rarely read, like a generated file
export const collapseThreshold = 1500;

export function isLargeChange(file: {
  readonly insertions: number;
  readonly deletions: number;
}): boolean {
  return file.insertions + file.deletions > collapseThreshold;
}

// How the Changes tab shows the changed files
export type ChangesView = 'list' | 'tree';

export interface RefInfo {
  readonly kind: RefKind;
  readonly name: string;
  readonly commit: string;
}

// What to check out: a branch switches to it, a remote branch switches to the
// local branch of the same name, creating one that tracks it if needed, and a
// tag or a commit detaches HEAD there
export type CheckoutTarget =
  | { readonly kind: RefKind; readonly name: string }
  | { readonly kind: 'commit'; readonly hash: string };

// A ref the user pinned to the bookmarks row; by name, as its commit moves
export interface BookmarkRef {
  readonly kind: RefKind;
  readonly name: string;
}

// A commit the user pinned to the bookmarks row, by its full hash
export interface BookmarkCommit {
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
  readonly files: number;
}

// A line of the commit graph within one row, between lanes; the top half runs
// from the row above into the commit's dot, the bottom half from the dot to
// the row below
export interface GraphLine {
  readonly from: number;
  readonly to: number;
  readonly color: number;
  readonly bottom: boolean;
  // Drawn dotted, from the working tree down to the commit it is based on
  readonly dashed?: boolean;
}

// The commit graph within one row: the lane of the commit's dot, and the lines
export interface GraphRow {
  readonly lane: number;
  readonly color: number;
  readonly lines: readonly GraphLine[];
  // Set on merge commits; clicking their dot collapses or expands them
  readonly merge?: 'collapsed' | 'expanded';
  // How many commits a collapsed merge hides
  readonly hidden?: number;
  // The working tree's row, whose dot is a square
  readonly workingTree?: boolean;
}

export interface FileChange {
  readonly path: string;
  readonly oldPath: string | undefined;
  // U is untracked
  readonly status: 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U' | '?';
  readonly insertions: number;
  readonly deletions: number;
}

export interface TabInfo {
  // The repository root, which also identifies the tab
  readonly root: string;
  readonly name: string;
}

export type ToExtension =
  | { readonly type: 'ready' }
  | { readonly type: 'selectTab'; readonly root: string }
  | { readonly type: 'addTab' }
  | { readonly type: 'closeTab'; readonly root: string }
  | { readonly type: 'sortTabs' }
  // The pointer is on a tab, which is loaded in the background so it opens
  // as fast as one that was open before
  | { readonly type: 'preloadTab'; readonly root: string }
  // The widths of the Commits and Files columns, saved per user
  | { readonly type: 'setColumnWidths'; readonly widths: readonly number[] }
  // Collapses or expands one merge commit, unlike the setting
  | { readonly type: 'toggleMerge'; readonly hash: string }
  // Whether merge commits start collapsed, saved per user
  | { readonly type: 'setCollapseMerges'; readonly collapse: boolean }
  // Whether the Files column lists the changes or the whole repository
  | { readonly type: 'setFilesMode'; readonly mode: FilesMode }
  // Whether the Changes tab is a list or a tree, saved per user
  | { readonly type: 'setChangesView'; readonly view: ChangesView }
  // The bookmarks of the active tab's repository, saved per repository and user
  | { readonly type: 'setBookmarks'; readonly bookmarks: readonly Bookmark[] }
  // Asks for every file of the repository at a commit
  | { readonly type: 'loadTree'; readonly hash: string }
  // Asks for the diff of a large file left out of the commit's diff
  | {
      readonly type: 'loadFileDiff';
      readonly hash: string;
      readonly path: string;
    }
  // Written to the Fastforward log, so webview problems show up there too
  | {
      readonly type: 'log';
      readonly level: 'info' | 'error';
      readonly message: string;
    }
  // Selects a commit that may not be loaded yet, such as a branch's tip
  | { readonly type: 'jump'; readonly hash: string }
  | { readonly type: 'checkout'; readonly target: CheckoutTarget }
  // Pulls the checked-out branch from its upstream, or pushes it there
  | { readonly type: 'sync'; readonly action: SyncAction }
  // Looks up a hash typed in the address bar, while typing
  | { readonly type: 'lookupHash'; readonly query: string }
  // Back or forward in the tab's history, several steps from its dropdown
  | {
      readonly type: 'navigate';
      readonly direction: 'back' | 'forward';
      readonly steps: number;
    }
  // Asks for the commits at positions start..start+count of the history
  | {
      readonly type: 'loadCommits';
      readonly start: number;
      readonly count: number;
    }
  // The commit at the top of the list once scrolling stops, and how far the
  // list is scrolled into it
  | {
      readonly type: 'scrolled';
      readonly hash: string;
      readonly offset: number;
    }
  | {
      readonly type: 'selectCommit';
      // Undefined clears the selection
      readonly hash: string | undefined;
      // Position in the history, to scroll back to it when the view reopens
      readonly index: number | undefined;
      // Moving through the list with the arrow keys, which adds no step to
      // the back history
      readonly replace?: boolean;
    }
  | {
      readonly type: 'selectFile';
      readonly hash: string;
      readonly path: string | undefined;
    };

export type ToWebview =
  // Undefined widths use the defaults
  | {
      readonly type: 'layout';
      readonly columnWidths: readonly number[] | undefined;
      readonly collapseMerges: boolean;
      readonly filesMode: FilesMode;
      readonly changesView: ChangesView;
    }
  // The bookmarks of the active tab's repository
  | { readonly type: 'bookmarks'; readonly bookmarks: readonly Bookmark[] }
  // A pull or push that is running, or undefined once it's done
  | { readonly type: 'syncing'; readonly action: SyncAction | undefined }
  // Answers lookupHash
  | {
      readonly type: 'hashLookup';
      readonly query: string;
      readonly result: HashLookup;
    }
  // The tab's history, nearest first both ways
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
  | {
      readonly type: 'repository';
      // The current branch's name, and the commit HEAD points to
      readonly head: string | undefined;
      readonly headCommit: string | undefined;
      // The remote branch the checked-out branch tracks, like origin/main
      readonly headUpstream: string | undefined;
      // Commits the checked-out branch has that its upstream doesn't, and the
      // other way round, as of the last fetch
      readonly ahead: number;
      readonly behind: number;
      readonly refs: readonly RefInfo[];
    }
  // Starts a new history of every branch, remote and tag: its size, so the
  // list has its full height at once, and the first page of commits
  | {
      readonly type: 'commits';
      readonly total: number;
      // [position, number of refs] for every commit that has refs, so the
      // height of each row is known before its commit is loaded
      readonly decorations: readonly (readonly [number, number])[];
      // The most lanes any row of the graph uses
      readonly graphWidth: number;
      // The commits the list shows first, from position start, and their graph
      readonly start: number;
      readonly commits: readonly CommitInfo[];
      readonly graph: readonly GraphRow[];
      // The graph of the working tree's row, above the commits
      readonly workingTreeGraph: GraphRow;
      // Position of the selected commit, to scroll to
      readonly selectedIndex: number | undefined;
      // After a reload the user didn't ask for: the commit that was at the top
      // of the list, and how far into it, so the list stays where it was
      readonly anchor:
        { readonly index: number; readonly offset: number } | undefined;
    }
  // Commits at positions start.. of the history, answering loadCommits
  | {
      readonly type: 'commitPage';
      readonly start: number;
      readonly commits: readonly CommitInfo[];
      readonly graph: readonly GraphRow[];
    }
  // Scrolls to a commit and selects it, answering jump
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
  // The diff of one large file, answering loadFileDiff
  | {
      readonly type: 'fileDiff';
      readonly hash: string;
      readonly path: string;
      readonly patch: string;
    }
  // Every file of the repository at a commit, answering loadTree
  | {
      readonly type: 'tree';
      readonly hash: string;
      readonly paths: readonly string[];
    }
  // A file the commit didn't change, shown whole instead of a diff
  | {
      readonly type: 'fileContent';
      readonly hash: string;
      readonly path: string;
      readonly content: string;
      readonly binary: boolean;
    }
  | { readonly type: 'error'; readonly message: string };
