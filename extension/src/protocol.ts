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
  // Written to the Fastforward log, so webview problems show up there too
  | {
      readonly type: 'log';
      readonly level: 'info' | 'error';
      readonly message: string;
    }
  | { readonly type: 'selectRef'; readonly ref: string | undefined }
  | { readonly type: 'selectCommit'; readonly hash: string }
  | {
      readonly type: 'selectFile';
      readonly hash: string;
      readonly path: string | undefined;
    };

export type ToWebview =
  | {
      readonly type: 'tabs';
      readonly tabs: readonly TabInfo[];
      readonly active: string | undefined;
    }
  | {
      readonly type: 'repository';
      readonly head: string | undefined;
      readonly refs: readonly RefInfo[];
    }
  | {
      readonly type: 'commits';
      readonly ref: string | undefined;
      readonly commits: readonly CommitInfo[];
    }
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
