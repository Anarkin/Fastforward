import type { ReadPatch } from './cli/diff';
import type { Refs } from './cli/repository';
import type { Changed, Watcher } from './cli/watch';
import type { UntrackedPatches } from './cli/workingTree';
import type { Fetched, RepositoryAt } from './operations';
import {
  type GitToWebview,
  workingTreeHash,
  type TextRequest,
} from '../shared/protocol';
import type { ToWebviewOf } from '../../../shell/shared/protocol';
import type { Page } from '../../../shell/main/shell';
import { strings, type Sentence } from '../../../shared/strings';
import type { Compared } from '../../../shell/main/storage';
import type { TabState } from './tabState';
import { shownSide } from '../shared/comparisons';

export type RunningOn = 'pushingTag' | 'pullingBranch' | 'pushingBranch';

export interface TabWork extends TabState {
  preloading: Promise<void> | undefined;
  loadingHistory: Promise<void> | undefined;
  readingHistory: AbortController | undefined;
  refreshing: boolean;
  refreshAgain: Map<Session | undefined, Context>;
  changedAgain: Changed;
  refreshedAgain: PromiseWithResolvers<void> | undefined;
  loadsAgain: Refresh[];
  refreshError: Sentence | undefined;
  isRepository: boolean | undefined;
  refused: boolean;
  selection: number | undefined;
  navigating: Promise<void>;
  movingHead: Promise<void>;
  runningOn: Record<RunningOn, Set<string>>;
  diffRequest: number;
  diffOwed: boolean;
  loadingFiles: AbortController;
  loadingDiff: AbortController;
  prefetching: Prefetching | undefined;
  readonly closed: AbortController;
  untrackedPatches: UntrackedPatches;
  indexPaths: readonly string[] | undefined;
  refsRead: number;
  repositoryShown: number;
}

interface Prefetching {
  readonly hash: string;
  readonly controller: AbortController;
}

export interface ReadRefs extends Refs {
  readonly read: number;
}

export type GitPost = GitToWebview | ToWebviewOf<'notice'>;

export interface Session {
  readonly page: Page;
  readonly post: (message: GitPost) => void;
  readonly disposed: boolean;
  watcher: Watcher | undefined;
  watching: AbortController | undefined;
  comparing?: Comparing;
}

export interface Comparing {
  readonly tab: string;
  readonly compared: Compared;
  running: AbortController | undefined;
  readonly stop: () => void;
  version: number;
}

export interface Fetching {
  readonly fetched: Promise<Fetched>;
  readonly interactive: boolean;
}

export interface Refresh {
  readonly run: () => Promise<void>;
  readonly done: PromiseWithResolvers<void>;
}

export interface EarlyPatch {
  readonly patch: Promise<ReadPatch | undefined>;
  readonly loading: AbortController;
  readonly ignoreWhitespace: boolean;
}

export interface Fetchable extends RepositoryAt {
  readonly repository: string;
}

export interface Context extends Fetchable {
  readonly tab: TabWork;
  readonly session: Session | undefined;
  readonly post: (message: GitPost) => void;
}

export function notInHistory(context: Context, hash: string): void {
  context.post({
    type: 'error',
    message: strings.commits.notInHistory(hash),
  });
}

export function uniqueTexts(requests: readonly TextRequest[]): TextRequest[] {
  return [
    ...new Map(
      requests.map((request) => [`${request.side}\0${request.path}`, request]),
    ).values(),
  ];
}

export function shownCommit(hash: string): string | undefined {
  const shown = shownSide(hash);
  return shown === workingTreeHash ? undefined : shown;
}
