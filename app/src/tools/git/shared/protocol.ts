import type { Sentence } from '../../../lib/shared/sentences';
import type { SearchOptions } from '../../../lib/shared/searchOptions';
import type { CloneAsk, CloneView } from './clone';
import {
  linkMode,
  workingTreeHash,
  type ChangeArea,
  type FileChange,
} from '../../../lib/shared/changes';
import {
  diffLayouts,
  type DiffLayout,
  type DiffSettingMessage,
  type LeftOut,
  type TextRequest,
} from '../../../components/diff/shared/protocol';

export const viewVersion = 1;

export {
  diffLayouts,
  linkMode,
  workingTreeHash,
  type ChangeArea,
  type DiffLayout,
  type FileChange,
  type LeftOut,
  type TextRequest,
};

export const workingTreeIndex = -1;

export type RefKind = 'branch' | 'remote' | 'tag' | 'remote-tag';

export interface CommitResults {
  readonly commits: readonly CommitInfo[];
  readonly more: number;
}

export interface CommitSearch {
  readonly commits: readonly CommitInfo[];
  readonly capped: boolean;
}

export interface NavigationEntry {
  readonly hash: string;
  readonly subject: string | undefined;
}

export const commitPageSize = 100;

export const commitPagesAsked = 4;

export function pageStart(index: number): number {
  return index - (index % commitPageSize);
}

export type Tracking =
  | {
      readonly upstream: string;
      readonly ahead: number;
      readonly behind: number;
    }
  | { readonly upstream: string; readonly gone: true };

export interface RefInfo {
  readonly kind: RefKind;
  readonly name: string;
  readonly commit: string;
  readonly remote?: string;
  readonly tracking?: Tracking;
}

export interface StashInfo {
  readonly name: string;
  readonly commit: string;
  readonly message: string;
}

export type CheckoutTarget =
  | { readonly kind: Exclude<RefKind, 'remote-tag'>; readonly name: string }
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

const bookmarkKinds: readonly (RefKind | 'commit')[] = [
  'branch',
  'remote',
  'tag',
  'remote-tag',
  'commit',
];

export function isBookmark(value: unknown): value is Bookmark {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    'name' in value &&
    bookmarkKinds.some((kind) => kind === value.kind) &&
    typeof value.name === 'string'
  );
}

export interface CommitInfo {
  readonly hash: string;
  readonly subject: string;
  readonly body: string;
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

export interface CrowdedCommit {
  readonly position: number;
  readonly hash: string;
  readonly lanes: number;
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

export interface RepositoryInfo {
  readonly root: string;
  readonly name: string;
  readonly folder?: string;
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
  readonly tagRemote?: string;
}

export interface LastFetch {
  readonly succeeded?: number;
  readonly failed?: number;
}

export type Direction = 'back' | 'forward';

export interface ScrollTarget {
  readonly index: number;
  readonly offset?: number;
  readonly report?: number;
}

export type GitToHost =
  | { readonly type: 'openRepository'; readonly root: string }
  | { readonly type: 'browseRepositories' }
  | { readonly type: 'initRepository' }
  | { readonly type: 'initInside'; readonly folder: string }
  | { readonly type: 'openClone' }
  | { readonly type: 'closeClone' }
  | { readonly type: 'chooseCloneFolder'; readonly folder: string }
  | {
      readonly type: 'checkCloneTarget';
      readonly folder: string;
      readonly name: string;
    }
  | ({ readonly type: 'clone' } & CloneAsk)
  | { readonly type: 'stopClone' }
  | { readonly type: 'forgetRecent'; readonly root: string }
  | { readonly type: 'selectWorktree'; readonly root: string }
  | { readonly type: 'preloadWorktree'; readonly root: string }
  | { readonly type: 'setColumnWidths'; readonly widths: readonly number[] }
  | { readonly type: 'setCollapseMerges'; readonly collapse: boolean }
  | DiffSettingMessage
  | { readonly type: 'setShowAllFiles'; readonly show: boolean }
  | { readonly type: 'setAutoFetch'; readonly on: boolean }
  | (TabMessage & {
      readonly root: string;
    });

export type TabMessage =
  | { readonly type: 'setBookmarks'; readonly bookmarks: readonly Bookmark[] }
  | { readonly type: 'setSolo'; readonly solo: boolean }
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
  | { readonly type: 'prefetchDiff'; readonly hash: string }
  | {
      readonly type: 'prefetchTexts';
      readonly hash: string;
      readonly texts: readonly TextRequest[];
    }
  | { readonly type: 'jump'; readonly hash: string }
  | {
      readonly type: 'viewFile';
      readonly path: string;
      readonly blob?: string;
      readonly rev?: string;
    }
  | { readonly type: 'checkout'; readonly target: CheckoutTarget }
  | { readonly type: 'fetch' }
  | { readonly type: 'refresh' }
  | { readonly type: 'pull' }
  | { readonly type: 'push' }
  | { readonly type: 'pushTag'; readonly name: string }
  | { readonly type: 'pullBranch'; readonly name: string }
  | { readonly type: 'pushBranch'; readonly name: string }
  | { readonly type: 'lookupHash'; readonly query: string }
  | {
      readonly type: 'searchCommits';
      readonly query: string;
      readonly options: SearchOptions;
    }
  | { readonly type: 'stopCommitSearch' }
  | {
      readonly type: 'navigate';
      readonly direction: Direction;
      readonly steps: number;
    }
  | {
      readonly type: 'loadCommits';
      readonly generation: number;
      readonly start: number;
      readonly count: number;
    }
  | {
      readonly type: 'scrolled';
      readonly hash: string;
      readonly offset: number;
      readonly report: number;
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

export type GitToWebview =
  | {
      readonly type: 'layout';
      readonly columnWidths: readonly number[];
      readonly defaultColumnWidths: readonly number[];
      readonly collapseMerges: boolean;
      readonly showEntireFile: boolean;
      readonly ignoreWhitespace: boolean;
      readonly diffLayout: DiffLayout;
      readonly showAllFiles: boolean;
      readonly autoFetch: boolean;
      readonly autoFetchMinutes: number;
    }
  | { readonly type: 'bookmarks'; readonly bookmarks: readonly Bookmark[] }
  | { readonly type: 'solo'; readonly solo: boolean }
  | { readonly type: 'fetching'; readonly running: boolean }
  | { readonly type: 'pulling'; readonly running: boolean }
  | { readonly type: 'pushing'; readonly running: boolean }
  | { readonly type: 'pushingTag'; readonly names: readonly string[] }
  | { readonly type: 'pullingBranch'; readonly names: readonly string[] }
  | { readonly type: 'pushingBranch'; readonly names: readonly string[] }
  | ({ readonly type: 'lastFetch' } & LastFetch)
  | { readonly type: 'applyingSolo'; readonly running: boolean }
  | {
      readonly type: 'hashLookup';
      readonly query: string;
      readonly result: CommitResults;
    }
  | {
      readonly type: 'commitSearch';
      readonly query: string;
      readonly options: SearchOptions;
      readonly result: CommitSearch;
    }
  | {
      readonly type: 'navigation';
      readonly back: readonly NavigationEntry[];
      readonly forward: readonly NavigationEntry[];
    }
  | {
      readonly type: 'worktrees';
      readonly tab?: string;
      readonly worktree: string | undefined;
      readonly worktrees: readonly WorktreeInfo[] | undefined;
    }
  | { readonly type: 'recent'; readonly recent: readonly RepositoryInfo[] }
  | { readonly type: 'clone'; readonly view: CloneView | undefined }
  | { readonly type: 'cloneFolder'; readonly folder: string }
  | {
      readonly type: 'cloneTarget';
      readonly folder: string;
      readonly name: string;
      readonly problem?: Sentence;
    }
  | {
      readonly type: 'confirmInit';
      readonly folder: string;
      readonly repository: string;
    }
  | ({ readonly type: 'repository' } & RepositoryState)
  | {
      readonly type: 'commits';
      readonly generation: number;
      readonly total: number;
      readonly decorations: readonly number[];
      readonly crowded: readonly CrowdedCommit[];
      readonly start: number;
      readonly commits: readonly CommitInfo[];
      readonly graph: readonly GraphRow[];
      readonly workingTreeGraph: GraphRow;
      readonly selectedIndex: number | undefined;
      readonly keysFrom?: number;
      readonly scrollTarget: ScrollTarget | undefined;
    }
  | {
      readonly type: 'crowdedLanes';
      readonly generation: number;
      readonly crowded: readonly CrowdedCommit[];
    }
  | {
      readonly type: 'commitPage';
      readonly generation: number;
      readonly start: number;
      readonly count: number;
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
      readonly all?: readonly FileChange[];
    }
  | {
      readonly type: 'diff';
      readonly hash: string;
      readonly path: string | undefined;
      readonly area?: ChangeArea;
      readonly patch: string;
      readonly leftOut?: readonly LeftOut[];
      readonly whitespaceOnly?: readonly string[];
    }
  | {
      readonly type: 'fileDiff';
      readonly hash: string;
      readonly path: string;
      readonly patch: string;
      readonly diff: number;
      readonly whitespaceOnly?: boolean;
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
      readonly type: 'prefetchedDiff';
      readonly hash: string;
      readonly patch: string;
    }
  | {
      readonly type: 'prefetchedTexts';
      readonly hash: string;
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
      readonly id?: string;
      readonly link?: true;
    }
  | { readonly type: 'error'; readonly message: Sentence }
  | { readonly type: 'clearError'; readonly message: Sentence };

export type GitToWebviewOf<T extends GitToWebview['type']> = Extract<
  GitToWebview,
  { readonly type: T }
>;
