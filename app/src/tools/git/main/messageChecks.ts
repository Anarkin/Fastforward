import { maxSteps } from './history/navigation';
import {
  diffLayouts,
  type TabMessage,
  type TextRequest,
  type GitToHost,
  commitPageSize,
  commitPagesAsked,
} from '../shared/protocol';
import { isColumnWidths } from '../shared/settings';
import { isBookmark } from './storage';
import { hiddenSides, type TabState } from './tabState';

const maxBookmarks = 1000;

const maxBookmarkName = 4096;

const maxCommitsAsked = commitPagesAsked * commitPageSize;

const maxTextsAsked = 10_000;

export function needsNoWholeHistory(
  tab: TabState,
  message: TabMessage,
): boolean {
  switch (message.type) {
    case 'loadCommits':
    case 'viewFile':
    case 'fetch':
    case 'pull':
    case 'push':
    case 'pushTag':
    case 'pullBranch':
    case 'pushBranch':
    case 'prefetchDiff':
    case 'prefetchTexts':
      return true;
    case 'checkout':
      return (
        message.target.kind !== 'commit' ||
        tab.fullHistory.has(message.target.hash)
      );
    case 'selectCommit':
      return (
        message.hash === undefined ||
        hiddenSides(tab, message.hash).length === 0
      );
    case 'selectFile':
    case 'loadTree':
    case 'loadTexts':
    case 'loadFileDiff':
      return hiddenSides(tab, message.hash).length === 0;
    default:
      return false;
  }
}

function isPathAsked(value: unknown): value is string {
  return (
    typeof value === 'string' && !value.includes('\0') && !value.includes('\n')
  );
}

function isTextRequest(value: unknown): value is TextRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'path' in value &&
    isPathAsked(value.path) &&
    'blob' in value &&
    typeof value.blob === 'string' &&
    'side' in value &&
    (value.side === 'old' || value.side === 'new')
  );
}

function areTextRequests(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length <= maxTextsAsked &&
    value.every(isTextRequest)
  );
}

function isCheckoutTarget(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || !('kind' in value)) {
    return false;
  }
  return value.kind === 'commit'
    ? 'hash' in value && typeof value.hash === 'string'
    : (value.kind === 'branch' ||
        value.kind === 'remote' ||
        value.kind === 'tag') &&
        'name' in value &&
        typeof value.name === 'string';
}

function isWhole(value: number, least: number, most: number): boolean {
  return Number.isInteger(value) && value >= least && value <= most;
}

function isOptional<T>(
  value: T | undefined,
  is: (value: T) => boolean,
): boolean {
  return value === undefined || is(value);
}

const isString = (value: unknown) => typeof value === 'string';

const isBoolean = (value: unknown) => typeof value === 'boolean';

export function wellFormed(message: GitToHost): boolean {
  if (typeof message !== 'object' || message === null) {
    return false;
  }
  switch (message.type) {
    case 'browseRepositories':
    case 'initRepository':
    case 'openClone':
    case 'closeClone':
    case 'stopClone':
      return true;
    case 'openRepository':
    case 'forgetRecent':
    case 'selectWorktree':
    case 'preloadWorktree':
      return isString(message.root);
    case 'initInside':
    case 'chooseCloneFolder':
      return isString(message.folder);
    case 'checkCloneTarget':
      return isString(message.folder) && isString(message.name);
    case 'clone':
      return [message.url, message.folder, message.name].every(isString);
    case 'setColumnWidths':
      return isColumnWidths(message.widths);
    case 'setCollapseMerges':
      return isBoolean(message.collapse);
    case 'setShowEntireFile':
    case 'setShowAllFiles':
      return isBoolean(message.show);
    case 'setIgnoreWhitespace':
      return isBoolean(message.ignore);
    case 'setAutoFetch':
      return isBoolean(message.on);
    case 'setDiffLayout':
      return diffLayouts.includes(message.layout);
    case 'loadCompareTexts':
      return areTextRequests(message.requests);
    default:
      return isString(message.root) && wellFormedInTab(message);
  }
}

function wellFormedInTab(message: TabMessage): boolean {
  switch (message.type) {
    case 'showUpstream':
    case 'showParent':
    case 'fetch':
    case 'pull':
    case 'push':
    case 'stopCommitSearch':
      return true;
    case 'setBookmarks':
      return (
        Array.isArray(message.bookmarks) &&
        message.bookmarks.length <= maxBookmarks &&
        message.bookmarks.every(
          (bookmark) =>
            isBookmark(bookmark) && bookmark.name.length <= maxBookmarkName,
        )
      );
    case 'setSolo':
      return isBoolean(message.solo);
    case 'loadTree':
    case 'jump':
    case 'toggleMerge':
      return isString(message.hash);
    case 'pushTag':
    case 'pullBranch':
    case 'pushBranch':
      return isString(message.name);
    case 'lookupHash':
    case 'searchCommits':
      return isString(message.query);
    case 'checkout':
      return isCheckoutTarget(message.target);
    case 'viewFile':
      return isPathAsked(message.path) && isOptional(message.blob, isString);
    case 'loadFileDiff':
      return (
        isString(message.hash) &&
        isPathAsked(message.path) &&
        Number.isFinite(message.diff)
      );
    case 'loadTexts':
      return (
        isString(message.hash) &&
        Number.isFinite(message.diff) &&
        areTextRequests(message.texts)
      );
    case 'prefetchDiff':
      return isString(message.hash);
    case 'prefetchTexts':
      return isString(message.hash) && areTextRequests(message.texts);
    case 'navigate':
      return (
        (message.direction === 'back' || message.direction === 'forward') &&
        isWhole(message.steps, 1, maxSteps)
      );
    case 'loadCommits':
      return (
        Number.isInteger(message.generation) &&
        isWhole(message.start, 0, Number.MAX_SAFE_INTEGER) &&
        isWhole(message.count, 1, maxCommitsAsked)
      );
    case 'scrolled':
      return (
        isString(message.hash) &&
        Number.isFinite(message.offset) &&
        Number.isFinite(message.report)
      );
    case 'selectCommit':
      return (
        isOptional(message.hash, isString) &&
        isOptional(message.replace, isBoolean) &&
        isOptional(message.selection, Number.isFinite)
      );
    case 'selectFile':
      return (
        isString(message.hash) &&
        isOptional(message.path, isPathAsked) &&
        isOptional(
          message.area,
          (area) => area === 'staged' || area === 'unstaged',
        )
      );
    default:
      return false;
  }
}
