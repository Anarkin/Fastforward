// Messages between the extension and the view's webview

// Selecting this instead of a commit hash shows the uncommitted changes
export const workingTreeHash = 'working-tree';

export type RefKind = 'branch' | 'remote' | 'tag';

export interface RefInfo {
  readonly kind: RefKind;
  readonly name: string;
  readonly commit: string;
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
  // The widths of the Locations, Commits and Files columns, saved per user
  | { readonly type: 'setColumnWidths'; readonly widths: readonly number[] }
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
      readonly refs: readonly RefInfo[];
    }
  // Starts a new history of every branch, remote and tag: its size, so the
  // list has its full height at once, and the first page of commits
  | {
      readonly type: 'commits';
      readonly total: number;
      readonly commits: readonly CommitInfo[];
      // Position of the selected commit, to scroll to
      readonly selectedIndex: number | undefined;
    }
  // Commits at positions start.. of the history, answering loadCommits
  | {
      readonly type: 'commitPage';
      readonly start: number;
      readonly commits: readonly CommitInfo[];
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
  | { readonly type: 'error'; readonly message: string };
