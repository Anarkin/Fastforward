// Messages between the extension and the view's webview

// Selecting this instead of a commit hash shows the uncommitted changes
export const workingTreeHash = 'working-tree';

export type RefKind = 'branch' | 'remote' | 'tag';

// What the Files column lists: the selected commit's changes, or every file
// of the repository at it
export type FilesMode = 'changes' | 'files';

export interface RefInfo {
  readonly kind: RefKind;
  readonly name: string;
  readonly commit: string;
}

// A ref the user pinned to the VIP row; by name, as its commit moves
export interface VipRef {
  readonly kind: RefKind;
  readonly name: string;
}

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
  // The widths of the Commits and Files columns, saved per user
  | { readonly type: 'setColumnWidths'; readonly widths: readonly number[] }
  // Collapses or expands one merge commit, unlike the setting
  | { readonly type: 'toggleMerge'; readonly hash: string }
  // Whether merge commits start collapsed, saved per user
  | { readonly type: 'setCollapseMerges'; readonly collapse: boolean }
  // Whether the Files column lists the changes or the whole repository
  | { readonly type: 'setFilesMode'; readonly mode: FilesMode }
  // The VIPs of the active tab's repository, saved per repository and user
  | { readonly type: 'setVips'; readonly vips: readonly VipRef[] }
  // Asks for every file of the repository at a commit
  | { readonly type: 'loadTree'; readonly hash: string }
  // Written to the Fastforward log, so webview problems show up there too
  | {
      readonly type: 'log';
      readonly level: 'info' | 'error';
      readonly message: string;
    }
  // Selects a commit that may not be loaded yet, such as a branch's tip
  | { readonly type: 'jump'; readonly hash: string }
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
    }
  // The VIPs of the active tab's repository
  | { readonly type: 'vips'; readonly vips: readonly VipRef[] }
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
