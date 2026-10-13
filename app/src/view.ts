import * as path from 'node:path';
import { AutoFetch, fetchOrder, type Timer } from './autoFetch';
import { readUpstream, remoteDefaultBranches } from './git/branches';
import {
  compareFiles,
  comparePatch,
  comparePatchArgs,
  leftOutOf,
  newSideUnchanged,
  pathspecs,
  readPatch,
  showFiles,
  showPatch,
  showPatchArgs,
  whitespaceOnlyChanges,
  withoutFilesInside,
  type PatchScope,
  type ReadPatch,
} from './git/diff';
import { gitErrorText } from './git/errorText';
import { BlobTexts } from './git/blobTexts';
import {
  listIndex,
  listTree,
  readBlobs,
  readFile,
  readImage,
  uniquePaths,
} from './git/files';
import { stashFiles, stashPatch } from './git/stashes';
import {
  findCommit,
  findCommits,
  headCommit,
  extendedHistory,
  listHistory,
  listRecentHistory,
  logCommits,
  recentTips,
  searchCommits,
} from './git/history';
import type { Commits } from './history/commits';
import {
  isFolder,
  listRemoteTags,
  listRemotes,
  readRefs,
  repositoryRoot,
  spellingOf,
  type Refs,
} from './git/repository';
import {
  isWatchFailure,
  watchRepository,
  type Changed,
  type Watcher,
} from './git/watch';
import {
  stagedPatch,
  uncommittedCount,
  UntrackedPatches,
  workingTreeFiles,
  workingTreePatch,
  type WorkingTree,
  type WorkingTreeDiff,
} from './git/workingTree';
import {
  listWorktrees,
  locateRepository,
  type Location,
  type Worktree,
} from './git/worktrees';
import { step, visit } from './history/navigation';
import { ImageReads } from './imageReads';
import type { Log } from './log';
import {
  canPull,
  checkout,
  fastForwardToUpstream,
  fetchAll,
  foundUpstream,
  pushTag,
  pushToUpstream,
  tagRemoteOf,
  reportFetched,
  type Fetched,
  type Pushed,
  type Notify,
  type RepositoryAt,
} from './operations';
import { defaultBookmarks, fingerprint, remoteTagRefs, sameTags } from './refs';
import { comparedOf, shownSide, workingTreeSide } from './shared/comparisons';
import { isFullHash, shortHash } from './shared/hashes';
import { hasRef } from './shared/refNames';
import { imageSourceOf, imageType } from './shared/images';
import { InFlight } from './shared/inFlight';
import { addNotice } from './shared/notices';
import {
  commitPageSize,
  includedChanges,
  leftOutChanges,
  workingTreeHash,
  type ChangeArea,
  type CheckoutTarget,
  type CommitSearch,
  type Direction,
  type FileChange,
  type LeftOut,
  type TabInfo,
  type TabMessage,
  type TextRequest,
  type ToHost,
  type ToWebview,
  type ToWebviewOf,
  type UpdateStatus,
  type AboutInfo,
  type WorktreeInfo,
} from './shared/protocol';
import { strings } from './shared/strings';
import { sameRoot, Storage } from './storage';
import {
  changesOf,
  commitsMessage,
  expandMerges,
  firstPage,
  forgetHistory,
  hiddenSides,
  historyLoaded,
  keep,
  keepSubjects,
  layOutHistory,
  loadHistory,
  mergesHidingCommit,
  navigationEntry,
  nearestSteps,
  newTabState,
  parentOf,
  pickable,
  refsKeepHistory,
  replayOf,
  select,
  stillThere,
  takeRefs,
  tipsInGitOrder,
  toggleMerges,
  unselect,
  type TabState,
} from './tabState';

const maxKeptUntrackedChars = 32_000_000;
export const refreshDelays = { delay: 100, gitDirDelay: 300, maxDelay: 1500 };
const everything: Changed = { refs: true, workingTree: true };
const nothing: Changed = { refs: false, workingTree: false };
const refsAlone: Changed = { refs: true, workingTree: false };

type RunningOn = 'pushingTag' | 'pullingBranch' | 'pushingBranch';

interface Tab extends TabState {
  preloading: Promise<void> | undefined;
  loadingHistory: Promise<void> | undefined;
  readingHistory: AbortController | undefined;
  refreshing: boolean;
  refreshAgain: Map<Session | undefined, Context>;
  changedAgain: Changed;
  refreshedAgain: PromiseWithResolvers<void> | undefined;
  loadsAgain: Refresh[];
  refreshError: string | undefined;
  isRepository: boolean | undefined;
  selection: number | undefined;
  navigating: Promise<void>;
  movingHead: Promise<void>;
  runningOn: Record<RunningOn, Set<string>>;
  diffRequest: number;
  diffOwed: boolean;
  loadingFiles: AbortController;
  loadingDiff: AbortController;
  readonly closed: AbortController;
  untrackedPatches: UntrackedPatches;
  indexPaths: readonly string[] | undefined;
}

export interface Host {
  chooseFolders(): Promise<readonly string[]>;
  openSettings(): Promise<void>;
  openDefaultSettings(): Promise<void>;
  settingsProblems(): readonly string[];
  checkForUpdates(): void;
  installUpdate(): void;
  updateStatus(): UpdateStatus;
  about(): AboutInfo;
  copyText(text: string): void;
}

export interface Connection {
  receive(message: ToHost): Promise<void>;
  refresh(): Promise<void>;
  dispose(): void;
}

interface Session {
  readonly post: (message: ToWebview) => void;
  watcher: Watcher | undefined;
  watching: AbortController | undefined;
  disposed: boolean;
}

interface Fetching {
  readonly fetched: Promise<Fetched>;
  readonly interactive: boolean;
}

interface Refresh {
  readonly run: () => Promise<void>;
  readonly done: PromiseWithResolvers<void>;
}

interface EarlyPatch {
  readonly patch: Promise<ReadPatch | undefined>;
  readonly loading: AbortController;
}

interface Fetchable extends RepositoryAt {
  readonly repository: string;
}

interface Context extends Fetchable {
  readonly tab: Tab;
  readonly session: Session | undefined;
  readonly post: (message: ToWebview) => void;
}

const silent = () => undefined;

function toAll(contexts: readonly Context[]): Context | undefined {
  const [first] = contexts;
  if (!first || contexts.length === 1) {
    return first;
  }
  return {
    ...first,
    post: (message) => {
      for (const context of contexts) {
        context.post(message);
      }
    },
  };
}

class OpeningFailed {
  constructor(
    readonly root: string,
    readonly error: unknown,
  ) {}
}

export class FastforwardView {
  private readonly tabStates = new Map<string, Tab>();
  private readonly blobTexts = new BlobTexts();
  private readonly repositories = new Map<string, string>();
  private readonly worktreeLists = new Map<string, readonly WorktreeInfo[]>();
  private readonly worktreeListings = new Map<string, number>();
  private grouped: Promise<void> | undefined;
  private readonly fetches = new Map<string, Fetching>();
  private readonly pushes = new Map<string, Promise<unknown>>();
  private readonly fetchFailures = new Set<string>();
  private readonly commitSearches = new Map<string, AbortController>();
  private readonly hashLookups = new Map<string, number>();
  private page: Session | undefined;
  private unsentNotices: readonly ToWebviewOf<'notice'>[] = [];
  private readonly inFlight = new InFlight();
  private readonly imageReads = new ImageReads();
  private readonly autoFetch: AutoFetch;
  private readonly quitting = new AbortController();
  private collapseMerges: boolean;
  private soloDefault: boolean;

  constructor(
    private readonly log: Log,
    private readonly gitPath: string,
    private readonly storage: Storage,
    private readonly host: Host,
    timer?: Timer,
    private readonly delays: {
      delay: number;
      maxDelay: number;
      gitDirDelay?: number;
    } = refreshDelays,
  ) {
    this.collapseMerges = storage.collapseMerges;
    this.soloDefault = storage.soloDefault;
    this.autoFetch = new AutoFetch(
      () => storage.autoFetchMinutes,
      () => fetchOrder(storage.tabs, storage.activeTab),
      (root) => this.inFlight.track(this.fetchInBackground(root)),
      timer,
    );
    this.autoFetch.update();
  }

  quit(): void {
    this.quitting.abort();
  }

  reloadSettings(): void {
    this.autoFetch.update();
    const collapseChanged = this.storage.collapseMerges !== this.collapseMerges;
    const soloChanged = this.storage.soloDefault !== this.soloDefault;
    this.collapseMerges = this.storage.collapseMerges;
    this.soloDefault = this.storage.soloDefault;
    for (const tab of this.tabStates.values()) {
      if (soloChanged) {
        forgetHistory(tab);
      } else {
        tab.shownStale = true;
      }
      tab.opened = false;
      if (collapseChanged) {
        tab.toggledMerges.clear();
      }
    }
  }

  connect(post: (message: ToWebview) => void): Connection {
    const session: Session = {
      post: (message) => {
        if (!session.disposed) {
          post(message);
        }
      },
      watcher: undefined,
      watching: undefined,
      disposed: false,
    };
    return {
      receive: (message) =>
        this.run(
          strings.log.handlingFailed(message.type),
          session,
          () => this.handle(message, session),
          this.worktreeAsked(message),
        ),
      refresh: () =>
        this.run(strings.log.refreshingFailed, session, async () => {
          const context = await this.context(session);
          if (context) {
            await this.refresh(context);
          }
        }),
      dispose: () => {
        session.disposed = true;
        this.stopWatching(session);
      },
    };
  }

  idle(): Promise<void> {
    return this.inFlight.settled();
  }

  image(url: URL): Promise<Response> {
    return this.inFlight.track(this.readImage(url));
  }

  private async readImage(url: URL): Promise<Response> {
    const source = imageSourceOf(url);
    const type = source && imageType(source.path);
    const tab = source && this.tabStates.get(source.root);
    if (!source || !type || tab?.isRepository !== true) {
      return new Response(null, { status: 404 });
    }
    const stash =
      source.revision === undefined
        ? undefined
        : tab.stashes.get(source.revision);
    try {
      const read = await this.imageReads.read(source, (limit) =>
        readImage(
          this.gitPath,
          source.root,
          { ...source, untracked: stash?.untracked },
          limit,
        ),
      );
      if (read.kind !== 'image') {
        return new Response(null, {
          status: read.kind === 'tooLarge' ? 413 : 404,
        });
      }
      const { buffer, byteOffset, byteLength } = read.bytes;
      const body =
        buffer instanceof ArrayBuffer
          ? new Uint8Array(buffer, byteOffset, byteLength)
          : new Uint8Array(read.bytes);
      return new Response(body, {
        headers: { 'content-type': type, 'cache-control': 'no-store' },
      });
    } catch (error) {
      this.log.error(strings.log.readingImageFailed(source.path));
      this.log.error(error instanceof Error ? error : gitErrorText(error));
      return new Response(null, { status: 500 });
    }
  }

  private isActive(root: string): boolean {
    const active = this.storage.activeWorktree;
    return active !== undefined && sameRoot(active, root);
  }

  private showsActiveTab(session: Session): boolean {
    const active = this.storage.activeWorktree;
    return (
      this.page === session &&
      active !== undefined &&
      this.tabStates.get(active)?.isRepository !== false
    );
  }

  private isActiveRepository(repository: string): boolean {
    const active = this.storage.activeTab;
    return active !== undefined && sameRoot(active, repository);
  }

  private repositoryOf(root: string): string {
    return this.repositories.get(root) ?? root;
  }

  private worktreeAsked(message: ToHost): string | undefined {
    switch (message.type) {
      case 'closeTab':
        return undefined;
      case 'selectTab':
      case 'preloadTab':
      case 'openRepository':
        return this.storage.worktreeOf(message.root);
      default:
        return 'root' in message ? message.root : undefined;
    }
  }

  private run(
    failed: string,
    session: Session,
    action: () => Promise<void>,
    root?: string,
  ): Promise<void> {
    return this.inFlight.track(this.runNow(failed, session, action, root));
  }

  private async runNow(
    failed: string,
    session: Session,
    action: () => Promise<void>,
    asked?: string,
  ): Promise<void> {
    try {
      await action();
    } catch (thrown) {
      const { root, error } =
        thrown instanceof OpeningFailed
          ? thrown
          : { root: asked, error: thrown };
      const text = gitErrorText(error);
      this.log.error(failed);
      this.log.error(error instanceof Error ? error : text);
      const gone = root !== undefined && (await this.folderGone(root));
      if (root === undefined || this.isActive(root)) {
        session.post({
          type: 'error',
          message: gone ? strings.messages.notRepository(root) : text,
        });
      }
    }
  }

  private async folderGone(root: string): Promise<boolean> {
    const tab = this.tabStates.get(root);
    if (!tab || (await isFolder(root))) {
      return false;
    }
    tab.isRepository = false;
    if (tab.refreshError !== undefined) {
      tab.refreshError = strings.messages.notRepository(root);
    }
    return true;
  }

  private async handle(message: ToHost, session: Session): Promise<void> {
    const { storage } = this;
    switch (message.type) {
      case 'ready':
        session.post(storage.layout);
        session.post({ type: 'update', status: this.host.updateStatus() });
        session.post({ type: 'about', ...this.host.about() });
        for (const problem of this.host.settingsProblems()) {
          session.post({
            type: 'notice',
            level: 'error',
            message: strings.messages.settingsProblem(problem),
          });
        }
        await this.groupTabs();
        await this.openTab(session, storage.activeTab);
        return;
      case 'openSettings':
        await this.host.openSettings();
        return;
      case 'openDefaultSettings':
        await this.host.openDefaultSettings();
        return;
      case 'checkForUpdates':
        this.host.checkForUpdates();
        return;
      case 'installUpdate':
        this.host.installUpdate();
        return;
      case 'copyText':
        this.host.copyText(message.text);
        return;
      case 'selectTab':
        if (
          this.isActiveRepository(message.root) &&
          this.showsActiveTab(session)
        ) {
          return;
        }
        await this.openTab(session, message.root);
        return;
      case 'selectWorktree': {
        const repository = storage.activeTab;
        if (
          repository === undefined ||
          !sameRoot(this.repositoryOf(message.root), repository) ||
          (this.isActive(message.root) && this.showsActiveTab(session))
        ) {
          return;
        }
        this.save(storage.setWorktree(repository, message.root));
        await this.openTab(session, repository);
        return;
      }
      case 'openRepository':
        if (storage.recent.some((root) => sameRoot(root, message.root))) {
          await this.openRepositories(session, [message.root], true);
        }
        return;
      case 'browseRepositories':
        await this.openRepositories(session, await this.host.chooseFolders());
        return;
      case 'forgetRecent':
        await this.storage.removeRecent(message.root);
        this.sendTabs(session);
        return;
      case 'closeTab': {
        const { tabs, activeTab } = storage;
        const index = tabs.findIndex((tab) => sameRoot(tab, message.root));
        const rest = tabs.filter((tab) => !sameRoot(tab, message.root));
        for (const [root, tab] of this.tabStates) {
          if (sameRoot(this.repositoryOf(root), message.root)) {
            this.forgetTab(root, tab);
          }
        }
        const active =
          activeTab !== undefined && sameRoot(activeTab, message.root)
            ? rest[Math.min(index, rest.length - 1)]
            : activeTab;
        this.save(storage.setTabs(rest, active));
        if (active === activeTab && active !== undefined) {
          this.postTabs(session);
          return;
        }
        await this.openTab(session, active);
        return;
      }
      case 'preloadTab':
        if (
          storage.hasTab(message.root) &&
          !this.isActiveRepository(message.root)
        ) {
          await allSettled([
            this.loadWorktrees(session, message.root),
            this.preload(
              session,
              storage.worktreeOf(message.root),
              message.root,
            ),
          ]);
        }
        return;
      case 'preloadWorktree': {
        const repository = storage.activeTab;
        if (
          repository !== undefined &&
          sameRoot(this.repositoryOf(message.root), repository) &&
          !this.isActive(message.root)
        ) {
          await this.preload(session, message.root, repository);
        }
        return;
      }
      case 'sortTabs': {
        const labels = new Map(
          tabInfos(storage.tabs).map((tab) => [
            tab.root,
            strings.tabs.label(tab.name, tab.folder),
          ]),
        );
        const tabs = storage.tabs.toSorted((a, b) =>
          (labels.get(a) ?? a).localeCompare(labels.get(b) ?? b, undefined, {
            sensitivity: 'base',
          }),
        );
        this.save(storage.setTabs(tabs, storage.activeTab));
        this.postTabs(session);
        return;
      }
      case 'log':
        this.log[message.level](strings.log.webview(message.message));
        return;
      case 'setColumnWidths':
        this.save(storage.setColumnWidths(message.widths));
        return;
      case 'setShowAllFiles':
        this.save(storage.setShowAllFiles(message.show));
        return;
      case 'setCollapseMerges': {
        this.save(storage.setCollapseMerges(message.collapse));
        this.collapseMerges = message.collapse;
        for (const tab of this.tabStates.values()) {
          tab.toggledMerges.clear();
          tab.shownStale = true;
        }
        const context = await this.context(session);
        if (context) {
          await this.sendShownHistory(context);
        }
        return;
      }
      case 'pinEntireFile': {
        this.save(storage.setEntireFilePinned(message.pinned));
        const context = await this.context(session);
        this.staleDiffs(context, (tab) => tab.path !== undefined);
        if (context?.tab.hash !== undefined && context.tab.path !== undefined) {
          await this.sendDiff(context, context.tab.hash);
        }
        return;
      }
      case 'setAutoFetch':
        this.save(storage.setAutoFetch(message.on));
        this.autoFetch.update(message.on);
        return;
      case 'setDiffLayout':
        this.save(storage.setDiffLayout(message.layout));
        return;
      case 'setWordWrap':
        this.save(storage.setWordWrap(message.wrap));
        return;
      case 'setShowWhitespace':
        this.save(storage.setShowWhitespace(message.show));
        return;
      case 'setIgnoreWhitespace': {
        this.save(storage.setIgnoreWhitespace(message.ignore));
        const context = await this.context(session);
        this.staleDiffs(context, () => true);
        if (context?.tab.hash !== undefined) {
          await this.sendDiff(context, context.tab.hash);
        }
        return;
      }
      case 'setSolo': {
        if (!storage.hasTab(this.repositoryOf(message.root))) {
          return;
        }
        const context = await this.context(session, message.root);
        this.save(storage.setSolo(message.root, message.solo));
        if (!context) {
          return;
        }
        context.post({ type: 'solo', solo: message.solo });
        context.post({ type: 'applyingSolo', running: true });
        try {
          forgetHistory(context.tab);
          context.tab.readingHistory?.abort();
          if (this.isActive(message.root)) {
            await this.refresh(context, () =>
              this.sendCommits(context, this.refsOf(context), true),
            );
          }
        } finally {
          context.post({ type: 'applyingSolo', running: false });
        }
        return;
      }
      case 'setBookmarks':
        this.save(
          storage.setBookmarks(
            this.repositoryOf(message.root),
            message.bookmarks,
          ),
        );
        return;
      case 'scrolled': {
        const tab = this.tabStates.get(message.root);
        if (tab) {
          tab.anchor = {
            hash: message.hash,
            offset: message.offset,
            report: message.report,
          };
        }
        return;
      }
      case 'searchCommits':
        await this.searchCommits(session, message.root, message.query);
        return;
      case 'stopCommitSearch':
        this.commitSearches.get(message.root)?.abort();
        return;
      default:
        if (this.isActive(message.root)) {
          await this.handleTab(message, session);
        }
    }
  }

  private async handleTab(
    message: Exclude<
      TabMessage,
      {
        type:
          | 'setBookmarks'
          | 'setSolo'
          | 'scrolled'
          | 'searchCommits'
          | 'stopCommitSearch';
      }
    >,
    session: Session,
  ): Promise<void> {
    const context = await this.context(session);
    if (!context) {
      return;
    }
    const picked = context.tab.selection;
    const { loadingHistory } = context.tab;
    if (loadingHistory && !needsNoWholeHistory(context.tab, message)) {
      await loadingHistory;
    }
    switch (message.type) {
      case 'loadCommits':
        await this.sendCommitPage(
          context,
          message.generation,
          message.start,
          message.count,
        );
        break;
      case 'toggleMerge':
        toggleMerges(context.tab, [message.hash]);
        await this.sendShownHistory(context, { scrollTo: message.hash });
        break;
      case 'checkout':
        await this.checkout(context, message.target, picked);
        break;
      case 'fetch':
        await this.fetch(context);
        break;
      case 'pull':
        await this.pull(context, picked);
        break;
      case 'push':
        await this.push(context);
        break;
      case 'pushTag':
        await this.pushTag(context, message.name);
        break;
      case 'pullBranch':
        await this.pullBranch(context, message.name, picked);
        break;
      case 'pushBranch':
        await this.pushBranch(context, message.name);
        break;
      case 'loadTree':
        if (this.isSelected(context, message.hash)) {
          await this.sendTree(context, message.hash);
        }
        break;
      case 'jump': {
        if (isFullHash(message.hash)) {
          await this.showCommit(context, message.hash.toLowerCase(), picked);
          break;
        }
        const found = await findCommit(
          context.gitPath,
          context.root,
          message.hash,
        );
        if (found.kind === 'found') {
          await this.showCommit(context, found.hash, picked);
        } else {
          this.notify(context)(
            'error',
            found.kind === 'ambiguous'
              ? strings.search.commitsStartWith(found.count, message.hash)
              : strings.search.noCommitStartsWith(message.hash),
          );
        }
        break;
      }
      case 'showUpstream':
        await this.showUpstream(context, picked);
        break;
      case 'showParent': {
        const parent = parentOf(context.tab);
        if (parent !== undefined) {
          await this.showCommit(context, parent, picked);
        }
        break;
      }
      case 'navigate':
        await this.navigate(context, message.direction, message.steps, picked);
        break;
      case 'lookupHash':
        await this.lookupHash(context, message.query);
        break;
      case 'selectCommit':
        context.tab.selection = message.selection;
        if (message.hash === undefined) {
          unselect(context.tab);
          break;
        }
        if (!pickable(context.tab, message.hash)) {
          this.notInHistory(context, message.hash);
          break;
        }
        this.visit(context, message.hash, message.replace);
        select(context.tab, message.hash);
        await this.sendCommit(context);
        break;
      case 'selectFile':
        if (this.isSelected(context, message.hash)) {
          if (
            context.tab.path !== message.path ||
            context.tab.area !== message.area
          ) {
            context.tab.entireFile = false;
          }
          context.tab.path = message.path;
          context.tab.area = message.area;
          await this.sendDiff(context, message.hash);
        }
        break;
      case 'showEntireFile': {
        const { hash, path: file } = context.tab;
        context.tab.entireFile = message.entire;
        if (hash !== undefined && file !== undefined) {
          await this.sendDiff(context, hash);
        }
        break;
      }
      case 'loadTexts':
        if (this.isSelected(context, message.hash)) {
          await this.sendTexts(context, message);
        }
        break;
      case 'loadFileDiff':
        if (this.isSelected(context, message.hash)) {
          await this.sendFileDiff(
            context,
            message.hash,
            message.path,
            message.diff,
          );
        }
        break;
    }
  }

  private known(context: Context, hash: string): boolean {
    if (stillThere(context.tab)(hash)) {
      return true;
    }
    this.notInHistory(context, hash);
    return false;
  }

  private isSelected(context: Context, hash: string): boolean {
    return this.known(context, hash) && hash === context.tab.hash;
  }

  private notInHistory(context: Context, hash: string): void {
    context.post({
      type: 'error',
      message: strings.commits.notInHistory(hash),
    });
  }

  private async openRepositories(
    session: Session,
    folders: readonly string[],
    reopened = false,
  ): Promise<void> {
    const { storage } = this;
    const page = () => (session.disposed ? (this.page ?? session) : session);
    const repositories: string[] = [];
    for (const folder of folders) {
      let location: Location | undefined;
      try {
        location = await locateRepository(this.gitPath, folder);
      } catch (error) {
        this.log.error(strings.log.openingFailed(folder));
        this.log.error(error instanceof Error ? error : String(error));
        page().post({
          type: 'notice',
          level: 'error',
          message: strings.messages.couldNotOpen(folder, gitErrorText(error)),
        });
        continue;
      }
      if (!location) {
        this.save(storage.removeRecent(folder));
        page().post({
          type: 'notice',
          level: 'error',
          message: strings.messages.notInRepository(folder),
        });
        continue;
      }
      const repository = await spellingOf(location.repository, storage.tabs);
      const usable = this.takeWorktrees(repository, location.worktrees).filter(
        (worktree) => !worktree.bare && !worktree.missing,
      );
      const saved = storage.worktreeOf(repository);
      const picked =
        reopened || location.worktree === undefined
          ? undefined
          : await spellingOf(
              location.worktree,
              usable.map((other) => other.path),
            );
      const worktree =
        picked ??
        usable.find((other) => sameRoot(other.path, saved))?.path ??
        usable[0]?.path;
      if (worktree !== undefined) {
        this.save(storage.setWorktree(repository, worktree));
      }
      repositories.push(repository);
      this.save(storage.addRecent(repository));
    }
    const added = repositories.filter(
      (repository, index) =>
        !storage.hasTab(repository) &&
        repositories.findIndex((other) => sameRoot(other, repository)) ===
          index,
    );
    this.save(storage.setTabs([...storage.tabs, ...added], storage.activeTab));
    const last = repositories.at(-1);
    if (last) {
      await this.openTab(page(), last);
    } else {
      this.postTabs(page());
    }
  }

  private async openTab(
    session: Session,
    repository: string | undefined,
  ): Promise<void> {
    const { tabs } = this.storage;
    const active =
      (repository && tabs.find((tab) => sameRoot(tab, repository))) ?? tabs[0];
    this.save(this.storage.setTabs(tabs, active));
    if (session.disposed) {
      return;
    }
    this.page = session;
    this.postTabs(session);
    const unsent = this.unsentNotices;
    this.unsentNotices = [];
    for (const notice of unsent) {
      session.post(notice);
    }
    if (active === undefined) {
      this.stopWatching(session);
      return;
    }
    const worktree = this.storage.worktreeOf(active);
    this.repositories.set(worktree, active);
    try {
      await allSettled([
        this.loadWorktrees(session, active),
        this.openWorktree(session, worktree),
      ]);
    } catch (error) {
      throw new OpeningFailed(worktree, error);
    }
  }

  private async openWorktree(session: Session, root: string): Promise<void> {
    const tab = this.tabState(root);
    for (const message of replayOf(tab)) {
      session.post(message);
    }
    await tab.preloading;
    if (!this.isActive(root)) {
      return;
    }
    this.stopWatching(session);
    const context = await this.context(session);
    if (!context || session.disposed || !this.isActive(context.root)) {
      return;
    }
    this.log.info(strings.log.tabOpen(context.root));
    this.save(this.storage.addRecent(context.repository));
    await allSettled([this.watch(context, session), this.showTab(context)]);
  }

  private groupTabs(): Promise<void> {
    const { storage } = this;
    this.grouped ??= storage.tabsGrouped
      ? Promise.resolve()
      : this.groupTabsNow().then(
          () => this.save(storage.setTabsGrouped()),
          (error: unknown) => {
            this.log.error(strings.log.groupingFailed);
            this.log.error(error);
          },
        );
    return this.grouped;
  }

  private async groupTabsNow(): Promise<void> {
    const { storage } = this;
    const { tabs, activeTab } = storage;
    const located = await Promise.all(
      tabs.map((root) => this.locateSavedTab(root)),
    );
    if (located.every((location) => location === undefined)) {
      return;
    }
    const unlocated = tabs.filter((_, index) => located[index] === undefined);
    const grouped: string[] = [];
    const shown = new Map<string, string>();
    const linked = new Set<string>();
    let active = activeTab;
    for (const [index, root] of tabs.entries()) {
      const location = located[index];
      const repository =
        location === undefined
          ? root
          : await spellingOf(location.repository, [
              root,
              ...unlocated,
              ...grouped,
            ]);
      if (!grouped.some((tab) => sameRoot(tab, repository))) {
        grouped.push(repository);
      }
      const worktree = location === undefined ? root : location.worktree;
      if (location !== undefined) {
        this.takeWorktrees(repository, location.worktrees);
        if (worktree !== undefined && !sameRoot(worktree, repository)) {
          linked.add(repository);
          await this.mergeBookmarks(repository, root);
        }
      }
      if (activeTab !== undefined && sameRoot(activeTab, root)) {
        active = repository;
        if (worktree !== undefined) {
          shown.set(repository, worktree);
        }
      } else if (worktree !== undefined && !shown.has(repository)) {
        shown.set(repository, worktree);
      }
    }
    for (const [repository, worktree] of shown) {
      if (linked.has(repository)) {
        await storage.setWorktree(repository, worktree);
      }
    }
    const added = storage.tabs.filter(
      (tab) =>
        !tabs.some((before) => sameRoot(before, tab)) &&
        !grouped.some((repository) => sameRoot(repository, tab)),
    );
    const activeNow = storage.activeTab;
    const switched =
      activeNow !== undefined &&
      (activeTab === undefined || !sameRoot(activeNow, activeTab));
    await storage.setTabs(
      [...grouped, ...added],
      switched ? activeNow : active,
    );
  }

  private async locateSavedTab(root: string): Promise<Location | undefined> {
    if (await isFolder(path.join(root, '.git'))) {
      return undefined;
    }
    try {
      return await locateRepository(this.gitPath, root);
    } catch {
      return undefined;
    }
  }

  private async mergeBookmarks(
    repository: string,
    root: string,
  ): Promise<void> {
    const { storage } = this;
    const added = storage.bookmarksOf(root);
    if (added === undefined) {
      return;
    }
    const kept = storage.bookmarksOf(repository) ?? [];
    await storage.setBookmarks(repository, [
      ...kept,
      ...added.filter(
        (bookmark) =>
          !kept.some(
            (other) =>
              other.kind === bookmark.kind && other.name === bookmark.name,
          ),
      ),
    ]);
  }

  private takeWorktrees(
    repository: string,
    worktrees: readonly Worktree[],
  ): Worktree[] {
    const [first, ...rest] = worktrees;
    const spelled = first ? [{ ...first, path: repository }, ...rest] : [];
    for (const worktree of spelled) {
      this.repositories.set(worktree.path, repository);
    }
    this.worktreeLists.set(repository, worktreeInfos(spelled));
    return spelled;
  }

  private async loadWorktrees(
    session: Session,
    repository: string,
  ): Promise<void> {
    const listing = (this.worktreeListings.get(repository) ?? 0) + 1;
    this.worktreeListings.set(repository, listing);
    const worktrees = await this.listedWorktrees(repository);
    if (
      worktrees === undefined ||
      this.worktreeListings.get(repository) !== listing
    ) {
      return;
    }
    const shown = JSON.stringify(this.worktreeLists.get(repository));
    this.forgetRemovedWorktrees(
      repository,
      this.takeWorktrees(repository, worktrees),
    );
    if (
      JSON.stringify(this.worktreeLists.get(repository)) !== shown &&
      this.isActiveRepository(repository)
    ) {
      const page = session.disposed ? this.page : session;
      if (page) {
        this.sendTabs(page);
      }
    }
  }

  private forgetRemovedWorktrees(
    repository: string,
    listed: readonly Worktree[],
  ): void {
    const active = this.storage.activeWorktree;
    for (const [root, tab] of this.tabStates) {
      if (
        sameRoot(this.repositoryOf(root), repository) &&
        !listed.some((worktree) => sameRoot(worktree.path, root)) &&
        (active === undefined || !sameRoot(active, root))
      ) {
        this.forgetTab(root, tab);
      }
    }
  }

  private forgetTab(root: string, tab: Tab): void {
    this.tabStates.delete(root);
    tab.closed.abort();
    tab.loadingFiles.abort();
    tab.loadingDiff.abort();
    this.commitSearches.get(root)?.abort();
  }

  private async listedWorktrees(
    repository: string,
  ): Promise<Worktree[] | undefined> {
    const known = [
      repository,
      this.storage.worktreeOf(repository),
      ...(this.worktreeLists.get(repository) ?? []).map(
        (worktree) => worktree.root,
      ),
    ];
    try {
      return await this.worktreesOf(repository, known);
    } catch (error) {
      this.log.error(strings.log.listingWorktreesFailed(repository));
      this.log.error(error);
      return undefined;
    }
  }

  private worktreesOf(
    repository: string,
    known: readonly string[],
  ): Promise<Worktree[]> {
    return listWorktrees(this.gitPath, repository, known);
  }

  private staleDiffs(
    active: Context | undefined,
    affected: (tab: TabState) => boolean,
  ): void {
    for (const tab of this.tabStates.values()) {
      if (tab !== active?.tab && tab.hash !== undefined && affected(tab)) {
        tab.diffStale = true;
      }
    }
  }

  private async showTab(context: Context): Promise<void> {
    const { tab } = context;
    const resend =
      (tab.entireFile && tab.path !== undefined) ||
      (tab.diffStale && tab.opened);
    tab.entireFile = false;
    tab.diffStale = false;
    if (resend && tab.hash !== undefined) {
      await this.sendDiff(context, tab.hash);
    }
    const firstOpen = !context.tab.opened;
    context.tab.opened = true;
    if (!firstOpen && context.tab.shown.commits) {
      this.log.info(strings.log.tabShownAsLeft(context.root));
      await this.addDefaultBookmarks(context);
      await this.refresh(context);
      return;
    }
    await this.loadTab(context);
  }

  private save(saving: Promise<void>): void {
    void saving.catch((error: unknown) => {
      this.log.error(strings.log.savingFailed);
      this.log.error(error);
    });
  }

  private async loadTab(context: Context): Promise<void> {
    const refs = this.refsOf(context);
    await allSettled([
      this.addDefaultBookmarks(context, refs),
      this.refresh(context, () => {
        context.tab.indexPaths = undefined;
        return allSettled([
          (async () => {
            if (!historyLoaded(context.tab)) {
              await this.sendCommits(context, refs);
            } else if (context.tab.shownStale) {
              await this.sendShownHistory(context, { keepPlace: true });
            }
            await this.sendCommit(context);
          })(),
          this.sendWorkingTree(context),
        ]);
      }),
      this.sendRepository(context, refs),
    ]);
  }

  private async preload(
    session: Session,
    root: string,
    repository: string,
  ): Promise<void> {
    this.repositories.set(root, repository);
    const tab = this.tabState(root);
    if (tab.opened || tab.preloading) {
      return;
    }
    tab.preloading = (async () => {
      try {
        const context = await this.context(session, root, false);
        if (!context || tab.opened) {
          return;
        }
        this.log.info(strings.log.preloading(root));
        tab.opened = true;
        await this.loadTab(context);
      } catch (error) {
        Object.assign(tab, newTabState());
        this.log.error(strings.log.preloadingFailed(root));
        this.log.error(error);
      } finally {
        tab.preloading = undefined;
      }
    })();
    await tab.preloading;
  }

  private async sendRepository(
    context: Context,
    refs: Promise<Refs>,
  ): Promise<void> {
    const { head, refs: listed, remotes, stashes } = await refs;
    const tagRemote = await tagRemoteOf(
      context.gitPath,
      context.root,
      remotes,
    ).catch(() => undefined);
    context.post({
      type: 'repository',
      head: head?.name,
      headCommit: head?.commit,
      refs: listed,
      ...(tagRemote !== undefined &&
        this.storage.remoteTagsOf(context.repository).has(tagRemote) && {
          tagRemote,
        }),
      stashes: stashes.map(({ name, commit, message }) => ({
        name,
        commit,
        message,
      })),
    });
  }

  private postTabs(session: Session): void {
    const { storage } = this;
    const { activeTab: active, activeWorktree: worktree } = storage;
    this.sendTabs(session);
    session.post({
      type: 'bookmarks',
      bookmarks: active ? (storage.bookmarksOf(active) ?? []) : [],
    });
    session.post({
      type: 'solo',
      solo: worktree !== undefined && storage.soloOf(worktree),
    });
    this.postLastFetch(session, active);
  }

  private sendTabs(session: Session): void {
    const { storage } = this;
    const { tabs, activeTab: active, activeWorktree: worktree } = storage;
    session.post({
      type: 'tabs',
      tabs: tabInfos(tabs),
      active,
      worktree,
      worktrees: active === undefined ? [] : this.worktreeLists.get(active),
      recent: tabInfos(
        storage.recent.filter(
          (root) =>
            !storage.hasTab(root) && !storage.hasTab(this.repositoryOf(root)),
        ),
      ),
    });
  }

  private async addDefaultBookmarks(
    context: Context,
    refs?: Promise<Refs>,
  ): Promise<void> {
    const saved = this.storage.bookmarksOf(context.repository);
    if (saved !== undefined) {
      context.post({ type: 'bookmarks', bookmarks: saved });
      return;
    }
    const [{ head, refs: listed }, defaults] = await Promise.all([
      refs ?? this.refsOf(context),
      remoteDefaultBranches(context.gitPath, context.root),
    ]);
    const bookmarks = defaultBookmarks(listed, defaults);
    if (head?.commit !== undefined) {
      this.save(this.storage.setBookmarks(context.repository, bookmarks));
    }
    context.post({ type: 'bookmarks', bookmarks });
  }

  private tabState(root: string): Tab {
    let tab = this.tabStates.get(root);
    if (!tab) {
      tab = {
        ...newTabState(),
        preloading: undefined,
        loadingHistory: undefined,
        readingHistory: undefined,
        refreshing: false,
        refreshAgain: new Map(),
        changedAgain: nothing,
        refreshedAgain: undefined,
        loadsAgain: [],
        refreshError: undefined,
        isRepository: undefined,
        selection: undefined,
        navigating: Promise.resolve(),
        movingHead: Promise.resolve(),
        runningOn: {
          pushingTag: new Set(),
          pullingBranch: new Set(),
          pushingBranch: new Set(),
        },
        diffRequest: 0,
        diffOwed: false,
        loadingFiles: new AbortController(),
        loadingDiff: new AbortController(),
        closed: new AbortController(),
        untrackedPatches: new UntrackedPatches(maxKeptUntrackedChars),
        indexPaths: undefined,
      };
      this.tabStates.set(root, tab);
    }
    return tab;
  }

  private async refsOf(context: Context): Promise<Refs> {
    const refs = await readRefs(context.gitPath, context.root);
    return {
      ...refs,
      refs: [
        ...refs.refs,
        ...remoteTagRefs(
          this.storage.remoteTagsOf(context.repository),
          refs.remotes,
        ),
      ],
    };
  }

  private async context(
    session: Session,
    root = this.storage.activeWorktree,
    live = true,
  ): Promise<Context | undefined> {
    if (!root) {
      return undefined;
    }
    const tab = this.tabState(root);
    tab.isRepository ||=
      (await repositoryRoot(this.gitPath, root)) !== undefined;
    if (!tab.isRepository) {
      if (live && this.isActive(root)) {
        tab.refreshError = strings.messages.notRepository(root);
        session.post({ type: 'error', message: tab.refreshError });
      }
      return undefined;
    }
    return {
      gitPath: this.gitPath,
      root,
      repository: this.repositoryOf(root),
      tab,
      session: live ? session : undefined,
      post: (message) => {
        keep(tab.shown, message);
        if (this.isActive(root) && this.tabStates.get(root) === tab) {
          this.postToPage(session, message);
        }
      },
    };
  }

  private async watch(context: Context, session: Session): Promise<void> {
    this.stopWatching(session);
    const watching = new AbortController();
    session.watching = watching;
    const started = performance.now();
    let watcher: Watcher;
    try {
      watcher = await this.startWatching(context, session, watching.signal);
    } catch (error) {
      if (!isWatchFailure(error)) {
        throw error;
      }
      this.couldNotWatch(context, error);
      return;
    }
    if (session.watching === watching) {
      session.watching = undefined;
    }
    if (
      watching.signal.aborted ||
      session.disposed ||
      session.watcher !== undefined ||
      !this.isActive(context.root) ||
      this.tabStates.get(context.root) !== context.tab
    ) {
      void this.inFlight.track(watcher.dispose());
      return;
    }
    session.watcher = watcher;
    if (performance.now() - started > this.delays.delay) {
      void this.run(
        strings.log.refreshingFailed,
        session,
        () => this.refresh(context),
        context.root,
      );
    }
  }

  private couldNotWatch(context: Context, error: unknown): void {
    this.log.error(strings.log.watchingFailed(context.root));
    this.log.error(error);
    context.post({
      type: 'notice',
      level: 'error',
      message: strings.messages.couldNotWatch(context.root),
    });
  }

  private stopWatching(session: Session): void {
    session.watching?.abort();
    session.watching = undefined;
    const { watcher } = session;
    session.watcher = undefined;
    if (watcher) {
      void this.inFlight.track(watcher.dispose());
    }
  }

  private startWatching(
    context: Context,
    session: Session,
    signal: AbortSignal,
  ): Promise<Watcher> {
    return watchRepository(context.gitPath, context.root, {
      ...this.delays,
      signal,
      onChange: (change) =>
        void this.run(
          strings.log.refreshingFailed,
          session,
          () => this.refresh(context, undefined, change),
          context.root,
        ),
      onWorktreesChange: () =>
        void this.inFlight.track(
          this.loadWorktrees(session, context.repository),
        ),
      onError: (error) => {
        this.log.error(strings.log.watchingFailed(context.root));
        this.log.error(error);
      },
      onStopped: (error) => this.couldNotWatch(context, error),
    });
  }

  private checkout(
    context: Context,
    target: CheckoutTarget,
    picked: number | undefined,
  ): Promise<void> {
    return this.queueHeadMove(context, () =>
      this.checkoutNow(context, target, picked),
    );
  }

  private async checkoutNow(
    context: Context,
    target: CheckoutTarget,
    picked: number | undefined,
  ): Promise<void> {
    if (
      !(await this.checkable(context, target)) ||
      !(await checkout(this.log, this.notify(context), context, target))
    ) {
      return;
    }
    await this.refresh(context);
    await context.tab.loadingHistory;
    await this.showHead(context, picked);
  }

  private async checkable(
    context: Context,
    target: CheckoutTarget,
  ): Promise<boolean> {
    if (target.kind === 'commit') {
      if (isFullHash(target.hash) && context.tab.fullHistory.has(target.hash)) {
        return true;
      }
      this.notInHistory(context, target.hash);
      return false;
    }
    const { refs } = await readRefs(context.gitPath, context.root);
    if (hasRef(refs, target)) {
      return true;
    }
    this.notify(context)(
      'error',
      strings.messages.noRefToCheckOut(target.name),
    );
    return false;
  }

  private async fetch(context: Context): Promise<void> {
    await this.refreshFetched(context, await this.fetchShown(context));
  }

  private async fetchShown(context: Context): Promise<Fetched> {
    context.post({ type: 'fetching', running: true });
    try {
      return await this.fetchRemotes(context, this.log, this.notify(context));
    } finally {
      context.post({ type: 'fetching', running: false });
    }
  }

  private async refreshFetched(
    context: Context,
    fetched: Fetched,
  ): Promise<void> {
    if (fetched.failed || fetched.changed) {
      await this.refresh(context, undefined, refsAlone);
    }
  }

  private pull(context: Context, picked: number | undefined): Promise<void> {
    return this.queueHeadMove(context, () => this.pullNow(context, picked));
  }

  private async pullNow(
    context: Context,
    picked: number | undefined,
  ): Promise<void> {
    const notify = this.notify(context);
    context.post({ type: 'pulling', running: true });
    let fetched: Fetched | undefined;
    let pulled = false;
    try {
      if (await canPull(this.log, notify, context)) {
        fetched = await this.fetchShown(context);
        pulled =
          !fetched.failed &&
          (await fastForwardToUpstream(this.log, notify, context));
      }
    } finally {
      context.post({ type: 'pulling', running: false });
    }
    if (pulled) {
      await this.refresh(context);
      await context.tab.loadingHistory;
      await this.showHead(context, picked);
    } else if (fetched) {
      await this.refreshFetched(context, fetched);
    }
  }

  private async push(context: Context): Promise<void> {
    await context.tab.movingHead;
    context.post({ type: 'pushing', running: true });
    let pushed: Pushed;
    try {
      pushed = await this.pushAfterRemoteWork(context);
    } finally {
      context.post({ type: 'pushing', running: false });
    }
    if (pushed === 'pushed') {
      await this.refresh(context, undefined, refsAlone);
    } else if (pushed === 'rejected') {
      await this.fetch(context);
    }
  }

  private pushAfterRemoteWork(context: Context): Promise<Pushed> {
    return this.afterRemoteWork(context.repository, () =>
      pushToUpstream(
        this.log,
        this.notify(context),
        context,
        this.quitting.signal,
      ),
    );
  }

  private async pullBranch(
    context: Context,
    name: string,
    picked: number | undefined,
  ): Promise<void> {
    const notify = this.notify(context);
    let fetched: Fetched | undefined;
    let moved = false;
    await this.runningOn(context, 'pullingBranch', name, async () => {
      const { refs, head } = await this.refsOf(context);
      if (!refs.some((ref) => ref.kind === 'branch' && ref.name === name)) {
        return;
      }
      if (head?.name === name) {
        await this.pull(context, picked);
        return;
      }
      const worktrees = await listWorktrees(context.gitPath, context.root);
      if (
        worktrees.some(
          (worktree) =>
            worktree.branch === name && !sameRoot(worktree.path, context.root),
        )
      ) {
        notify('info', strings.messages.checkedOutElsewhere(name));
        return;
      }
      if (await canPull(this.log, notify, context, name)) {
        fetched = await this.fetchShown(context);
        moved =
          !fetched.failed &&
          (await this.queueHeadMove(context, () =>
            this.moveToUpstream(context, name, picked),
          ));
      }
    });
    if (!moved && fetched) {
      await this.refreshFetched(context, fetched);
    }
  }

  private async moveToUpstream(
    context: Context,
    name: string,
    picked: number | undefined,
  ): Promise<boolean> {
    const { head } = await readRefs(context.gitPath, context.root);
    const checkedOut = head?.name === name;
    if (
      !(await fastForwardToUpstream(
        this.log,
        this.notify(context),
        context,
        checkedOut ? undefined : name,
      ))
    ) {
      return false;
    }
    if (checkedOut) {
      await this.refresh(context);
      await context.tab.loadingHistory;
      await this.showHead(context, picked);
    } else {
      await this.refresh(context, undefined, refsAlone);
    }
    return true;
  }

  private queueHeadMove<T>(
    context: Context,
    work: () => Promise<T>,
  ): Promise<T> {
    const { tab } = context;
    const moving = tab.movingHead.then(work);
    tab.movingHead = moving.then(
      () => undefined,
      () => undefined,
    );
    return moving;
  }

  private async pushBranch(context: Context, name: string): Promise<void> {
    const { refs } = await this.refsOf(context);
    if (!refs.some((ref) => ref.kind === 'branch' && ref.name === name)) {
      return;
    }
    const pushed = await this.runningOn(context, 'pushingBranch', name, () =>
      this.afterRemoteWork(context.repository, () =>
        pushToUpstream(
          this.log,
          this.notify(context),
          context,
          this.quitting.signal,
          name,
        ),
      ),
    );
    if (pushed === 'pushed') {
      await this.refresh(context, undefined, refsAlone);
    } else if (pushed === 'rejected') {
      await this.fetch(context);
    }
  }

  private async pushTag(context: Context, name: string): Promise<void> {
    const { refs, remotes } = await this.refsOf(context);
    const tag = refs.find((ref) => ref.kind === 'tag' && ref.name === name);
    if (!tag) {
      return;
    }
    const remote = await tagRemoteOf(
      context.gitPath,
      context.root,
      remotes,
    ).catch(() => undefined);
    if (
      remote !== undefined &&
      this.storage.remoteTagsOf(context.repository).get(remote)?.get(name) ===
        tag.commit
    ) {
      this.notify(context)(
        'info',
        strings.messages.tagAlreadyOnRemote(name, remote),
      );
      return;
    }
    const pushedTo = await this.runningOn(context, 'pushingTag', name, () =>
      this.afterRemoteWork(context.repository, () =>
        pushTag(
          this.log,
          this.notify(context),
          context,
          name,
          this.quitting.signal,
        ),
      ),
    );
    const known =
      pushedTo === undefined
        ? undefined
        : this.storage.remoteTagsOf(context.repository).get(pushedTo);
    if (pushedTo === undefined || known === undefined) {
      return;
    }
    await this.storage.setRemoteTags(
      context.repository,
      pushedTo,
      new Map([...known, [name, tag.commit]]),
    );
    await this.refresh(context, undefined, refsAlone);
  }

  private async runningOn<T>(
    context: Context,
    type: RunningOn,
    name: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const names = context.tab.runningOn[type];
    names.add(name);
    context.post({ type, names: [...names] });
    try {
      return await work();
    } finally {
      names.delete(name);
      context.post({ type, names: [...names] });
    }
  }

  private async afterRemoteWork<T>(
    repository: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const { pushes } = this;
    const pushing = (this.remoteWork(repository) ?? Promise.resolve()).then(
      work,
    );
    pushes.set(repository, pushing);
    try {
      return await pushing;
    } finally {
      if (pushes.get(repository) === pushing) {
        pushes.delete(repository);
      }
    }
  }

  private remoteWork(repository: string): Promise<unknown> | undefined {
    const running = [
      this.fetches.get(repository)?.fetched,
      this.pushes.get(repository),
    ].filter((work) => work !== undefined);
    return running.length === 0 ? undefined : Promise.all(running);
  }

  private async fetchRemotes(
    at: Fetchable,
    log: Log,
    notify: Notify,
    interactive = true,
  ): Promise<Fetched> {
    const { repository } = at;
    const { fetches } = this;
    const running = fetches.get(repository);
    const joined =
      running !== undefined && (!interactive || running.interactive);
    const fetching = joined ? running : this.startFetch(at, interactive);
    const result = await fetching.fetched;
    if (this.quitting.signal.aborted) {
      return result;
    }
    const latest = fetches.get(repository);
    if (!interactive && latest?.interactive) {
      return latest.fetched;
    }
    if (joined) {
      return result;
    }
    const fetched = reportFetched(log, notify, result);
    if (fetched) {
      this.fetchFailures.delete(repository);
    } else {
      this.fetchFailures.add(repository);
    }
    this.save(this.storage.recordFetch(repository, !fetched, Date.now()));
    if (this.page && this.isActiveRepository(repository)) {
      this.postLastFetch(this.page, repository);
    }
    if (fetched) {
      void this.inFlight.track(this.listTagsOfRemotes(at, interactive));
    }
    return result;
  }

  private async listTagsOfRemotes(
    { gitPath, root, repository }: Fetchable,
    interactive: boolean,
  ): Promise<void> {
    let remotes: string[];
    try {
      remotes = await listRemotes(gitPath, root);
      await this.storage.keepRemoteTags(repository, remotes);
    } catch (error) {
      this.log.warn(strings.log.listingRemoteTagsFailed(gitErrorText(error)));
      return;
    }
    let changed = false;
    let newlyKnown = false;
    for (const remote of remotes) {
      try {
        const tags = await listRemoteTags(gitPath, root, remote, {
          interactive,
          stop: this.quitting.signal,
        });
        const known = this.storage.remoteTagsOf(repository).get(remote);
        if (!sameTags(known, tags)) {
          await this.storage.setRemoteTags(repository, remote, tags);
          changed ||= !sameTags(known ?? new Map(), tags);
          newlyKnown ||= known === undefined;
        }
      } catch (error) {
        if (this.quitting.signal.aborted) {
          return;
        }
        this.log.warn(
          strings.log.listingTagsOfRemoteFailed(remote, gitErrorText(error)),
        );
      }
    }
    if (changed) {
      await this.refreshRefsShown(repository);
    } else if (newlyKnown) {
      await this.resendRepositoryShown(repository);
    }
  }

  private async resendRepositoryShown(repository: string): Promise<void> {
    const root = this.storage.worktreeOf(repository);
    const page = this.page;
    const shown =
      page && this.isActive(root) ? await this.context(page, root) : undefined;
    if (page && shown) {
      await this.run(
        strings.log.refreshingFailed,
        page,
        () => this.sendRepository(shown, this.refsOf(shown)),
        root,
      );
    }
  }

  private async refreshRefsShown(repository: string): Promise<void> {
    const root = this.storage.worktreeOf(repository);
    const page = this.page;
    const shown =
      page && this.isActive(root) ? await this.context(page, root) : undefined;
    if (page && shown) {
      await this.run(
        strings.log.refreshingFailed,
        page,
        () => this.refresh(shown, undefined, refsAlone),
        root,
      );
    }
  }

  private postLastFetch(
    session: Session,
    repository: string | undefined,
  ): void {
    session.post({
      type: 'lastFetch',
      ...(repository !== undefined && this.storage.lastFetchOf(repository)),
    });
  }

  private startFetch(at: Fetchable, interactive: boolean): Fetching {
    const { repository } = at;
    const { fetches } = this;
    const running = this.remoteWork(repository);
    const started: Fetching = {
      fetched: (running
        ? running.then(() => fetchAll(at, interactive, this.quitting.signal))
        : fetchAll(at, interactive, this.quitting.signal)
      ).finally(() => {
        if (fetches.get(repository) === started) {
          fetches.delete(repository);
        }
      }),
      interactive,
    };
    fetches.set(repository, started);
    return started;
  }

  private async fetchInBackground(repository: string): Promise<void> {
    const session = this.page;
    if (
      !session ||
      !this.storage.hasTab(repository) ||
      !(await isFolder(repository))
    ) {
      return;
    }
    const reported = !this.fetchFailures.has(repository);
    const log: Log = {
      info: silent,
      warn: reported ? (message) => this.log.warn(message) : silent,
      error: reported ? (error) => this.log.error(error) : silent,
    };
    const notify: Notify = reported
      ? this.noticesOf(session, repository)
      : silent;
    const fetched = await this.fetchRemotes(
      { gitPath: this.gitPath, root: repository, repository },
      log,
      notify,
      false,
    );
    if (fetched.failed || !fetched.changed) {
      return;
    }
    this.repositories.set(this.storage.worktreeOf(repository), repository);
    await this.refreshRefsShown(repository);
  }

  private notify(context: Context): Notify {
    const elsewhere =
      context.session && this.noticesOf(context.session, context.repository);
    return (level, message) => {
      if (elsewhere && !this.isActive(context.root)) {
        elsewhere(level, message);
      } else {
        context.post({ type: 'notice', level, message });
      }
    };
  }

  private noticesOf(session: Session, repository: string): Notify {
    return (level, message) =>
      this.storage.hasTab(repository) &&
      this.postToPage(session, {
        type: 'notice',
        level,
        message: strings.messages.inTab(this.tabLabel(repository), message),
      });
  }

  private tabLabel(repository: string): string {
    const tab = tabInfos(this.storage.tabs).find((info) =>
      sameRoot(info.root, repository),
    );
    return strings.tabs.label(tab?.name ?? tabName(repository), tab?.folder);
  }

  private postToPage(session: Session, message: ToWebview): void {
    const page = session.disposed ? this.page : session;
    if (message.type === 'notice' && (page === undefined || page.disposed)) {
      this.unsentNotices = addNotice(this.unsentNotices, message);
      return;
    }
    page?.post(message);
  }

  private visit(context: Context, hash: string, replace = false): void {
    const { tab } = context;
    const next = visit(tab.navigation, tab.hash, hash, replace);
    if (next !== tab.navigation) {
      tab.navigation = next;
      void this.inFlight.track(
        this.sendNavigation(context, hash).catch((error: unknown) => {
          this.log.error(strings.log.navigationFailed);
          this.log.error(error);
        }),
      );
    }
  }

  private async sendNavigation(
    context: Context,
    current = context.tab.hash,
  ): Promise<void> {
    const { tab } = context;
    const { navigation } = tab;
    const { back, forward } = nearestSteps(tab, current);
    const unknown = [...new Set([...back, ...forward])].filter(
      (hash) =>
        hash !== workingTreeHash &&
        !comparedOf(hash) &&
        !tab.subjects.has(hash),
    );
    if (unknown.length > 0) {
      keepSubjects(
        tab,
        await logCommits(context.gitPath, context.root, unknown),
      );
      if (tab.navigation !== navigation) {
        return;
      }
    }
    context.post({
      type: 'navigation',
      back: back.map((hash) => navigationEntry(tab, hash)),
      forward: forward.map((hash) => navigationEntry(tab, hash)),
    });
  }

  private async searchCommits(
    session: Session,
    root: string,
    query: string,
  ): Promise<void> {
    this.commitSearches.get(root)?.abort();
    const search = new AbortController();
    this.commitSearches.set(root, search);
    try {
      const context = this.isActive(root)
        ? await this.context(session)
        : undefined;
      await context?.tab.loadingHistory;
      if (!context || search.signal.aborted) {
        return;
      }
      const result = await this.commitsMatching(context, query, search.signal);
      if (!search.signal.aborted) {
        context.post({ type: 'commitSearch', query, result });
      }
    } catch (error) {
      if (!search.signal.aborted) {
        throw error;
      }
    } finally {
      if (this.commitSearches.get(root) === search) {
        this.commitSearches.delete(root);
      }
    }
  }

  private commitsMatching(
    context: Context,
    query: string,
    signal: AbortSignal,
  ): Promise<CommitSearch> {
    return searchCommits(
      context.gitPath,
      context.root,
      query,
      this.storage.soloOf(context.root),
      [...context.tab.stashes.keys()],
      signal,
    );
  }

  private async lookupHash(context: Context, query: string): Promise<void> {
    const lookup = (this.hashLookups.get(context.root) ?? 0) + 1;
    this.hashLookups.set(context.root, lookup);
    const result = await this.commitsStartingWith(context, query);
    if (this.hashLookups.get(context.root) === lookup) {
      context.post({ type: 'hashLookup', query, result });
    }
  }

  private commitsStartingWith(
    context: Context,
    query: string,
  ): ReturnType<typeof findCommits> {
    return findCommits(context.gitPath, context.root, query);
  }

  private navigate(
    context: Context,
    direction: Direction,
    steps: number,
    picked: number | undefined,
  ): Promise<void> {
    const { tab } = context;
    const navigating = tab.navigating.then(() =>
      this.navigateNow(context, direction, steps, picked),
    );
    tab.navigating = navigating.catch(() => undefined);
    return navigating;
  }

  private async navigateNow(
    context: Context,
    direction: Direction,
    steps: number,
    picked: number | undefined,
  ): Promise<void> {
    const { tab } = context;
    if (tab.selection !== picked) {
      return;
    }
    const result = step(
      tab.navigation,
      tab.hash,
      direction,
      steps,
      stillThere(tab),
    );
    if (!result) {
      return;
    }
    tab.navigation = result.navigation;
    await this.showCommit(context, result.target, picked, false);
    await this.sendNavigation(context);
  }

  private async showCommit(
    context: Context,
    hash: string,
    picked: number | undefined,
    record = true,
  ): Promise<void> {
    const { tab } = context;
    if (tab.selection !== picked) {
      return;
    }
    const merges = new Set(
      hiddenSides(tab, hash).flatMap((side) => mergesHidingCommit(tab, side)),
    );
    if (merges.size > 0) {
      expandMerges(tab, [...merges], this.storage.collapseMerges);
      await this.sendShownHistory(context, { scrollTo: hash });
      if (tab.selection !== picked) {
        return;
      }
    }
    if (hiddenSides(tab, hash).length > 0) {
      this.notify(context)('error', strings.commits.notInHistory(hash));
      return;
    }
    if (record) {
      this.visit(context, hash);
    }
    select(tab, hash);
    if (tab.index !== undefined) {
      context.post({
        type: 'reveal',
        hash,
        index: tab.index,
        selection: picked,
      });
    }
    await this.sendCommit(context);
  }

  private async showUpstream(
    context: Context,
    picked: number | undefined,
  ): Promise<void> {
    const notify = this.notify(context);
    const upstream = foundUpstream(
      notify,
      await readUpstream(context.gitPath, context.root),
    );
    if (!upstream) {
      return;
    }
    if (
      this.storage.soloOf(context.root) &&
      !stillThere(context.tab)(upstream.commit)
    ) {
      notify('info', strings.messages.upstreamHidden(upstream.name));
      return;
    }
    await this.showCommit(context, upstream.commit, picked);
  }

  private async showHead(
    context: Context,
    picked: number | undefined,
  ): Promise<void> {
    const head = await headCommit(context.gitPath, context.root);
    if (head) {
      await this.showCommit(context, head, picked);
    }
  }

  private async refresh(
    context: Context,
    load?: () => Promise<void>,
    change: Changed = everything,
  ): Promise<void> {
    const { tab } = context;
    try {
      await this.queueRefresh(context, load, change);
    } catch (error) {
      tab.refreshError = gitErrorText(error);
      throw error;
    }
    if (tab.refreshError !== undefined) {
      context.post({ type: 'clearError', message: tab.refreshError });
      tab.refreshError = undefined;
    }
  }

  private queueRefresh(
    context: Context,
    load: (() => Promise<void>) | undefined,
    change: Changed,
  ): Promise<void> {
    const { tab } = context;
    const run = load ?? (() => this.refreshOnce(context, change));
    if (!tab.refreshing) {
      const done = Promise.withResolvers<void>();
      tab.refreshing = true;
      void this.runRefreshes(tab, { run, done });
      return done.promise;
    }
    if (load) {
      const done = Promise.withResolvers<void>();
      tab.loadsAgain.push({ run, done });
      return done.promise;
    }
    tab.refreshAgain.set(context.session, context);
    tab.changedAgain = {
      refs: tab.changedAgain.refs || change.refs,
      workingTree: tab.changedAgain.workingTree || change.workingTree,
    };
    tab.refreshedAgain ??= Promise.withResolvers();
    return tab.refreshedAgain.promise;
  }

  private async runRefreshes(tab: Tab, first: Refresh): Promise<void> {
    let next: Refresh | undefined = first;
    while (next) {
      try {
        await next.run();
        next.done.resolve();
      } catch (error) {
        next.done.reject(error);
      }
      next = tab.loadsAgain.shift() ?? this.queuedRefresh(tab);
    }
    tab.refreshing = false;
  }

  private queuedRefresh(tab: Tab): Refresh | undefined {
    const pages = new Map<Session | undefined, Context>();
    for (const [session, context] of tab.refreshAgain) {
      const page = session?.disposed ? (this.page ?? session) : session;
      pages.set(page, pages.get(page) ?? context);
    }
    const again = toAll([...pages.values()]);
    const done = tab.refreshedAgain;
    if (!again || !done) {
      return undefined;
    }
    const change = tab.changedAgain;
    tab.refreshAgain.clear();
    tab.changedAgain = nothing;
    tab.refreshedAgain = undefined;
    return { run: () => this.refreshOnce(again, change), done };
  }

  private async refreshOnce(
    context: Context,
    { refs, workingTree }: Changed,
  ): Promise<void> {
    if (refs) {
      context.tab.indexPaths = undefined;
    }
    await allSettled([
      workingTree ? this.refreshWorkingTree(context) : Promise.resolve(),
      refs || context.tab.shownStale
        ? this.refreshHistory(context)
        : Promise.resolve(),
    ]);
  }

  private async refreshWorkingTree(context: Context): Promise<void> {
    const measured = context.tab.hash === workingTreeHash;
    const workingTree = await this.sendWorkingTree(context, measured);
    const { hash } = context.tab;
    const unmeasured = hash === workingTreeHash && !measured;
    if (hash !== undefined && workingTreeSide(hash) && !unmeasured) {
      await this.sendCommit(context, workingTree);
      if (
        context.tab.shown.tree?.hash === hash &&
        shownCommit(hash) === undefined
      ) {
        await this.sendTree(context, hash, workingTree);
      }
    }
  }

  private async refreshHistory(context: Context): Promise<void> {
    const refs = await this.refsOf(context);
    const { tab } = context;
    const { head, refs: listed, stashes, dates, shallow } = refs;
    if (shallow !== tab.shallow) {
      forgetHistory(tab);
    }
    if (fingerprint(head, listed, stashes) === tab.fingerprint) {
      if (tab.shownStale) {
        await this.sendShownHistory(context, { keepPlace: true });
      }
      return;
    }
    const known = Promise.resolve(refs);
    const solo = this.storage.soloOf(context.root);
    if (refsKeepHistory(tab, head, listed, solo, stashes, dates)) {
      this.log.info(strings.log.refsKept);
      const layOut = tab.shownStale || tab.headCommit !== head?.commit;
      takeRefs(tab, head, listed, stashes, dates);
      await Promise.all([
        this.sendRepository(context, known),
        this.sendShownHistory(context, { keepPlace: true, layOut }),
      ]);
      return;
    }
    const extended = historyLoaded(tab)
      ? await this.extendedHistory(context, refs, solo)
      : undefined;
    if (extended && this.storage.soloOf(context.root) === solo) {
      this.log.info(
        strings.log.refsExtended(extended.length - tab.fullHistory.length),
      );
      loadHistory(tab, extended, head, listed, stashes, dates);
      await Promise.all([
        this.sendRepository(context, known),
        this.sendShownHistory(context, { keepPlace: true }),
      ]);
      return;
    }
    this.log.info(strings.log.refsReloaded);
    await Promise.all([
      this.sendRepository(context, known),
      this.sendCommits(context, known, true),
    ]);
  }

  private async extendedHistory(
    context: Context,
    { head, refs, stashes, dates }: Refs,
    solo: boolean,
  ): Promise<Commits | undefined> {
    const { tab, gitPath, root } = context;
    const older = tab.fullHistory;
    const extended = await extendedHistory(
      gitPath,
      root,
      older,
      tab.heads,
      tipsInGitOrder(head, refs, solo, stashes, dates),
      solo ? [] : stashes.map((stash) => stash.commit),
      dates,
      { signal: tab.closed.signal },
    ).catch((error: unknown) => {
      if (tab.closed.signal.aborted) {
        return undefined;
      }
      throw error;
    });
    return tab.fullHistory === older ? extended : undefined;
  }

  private async sendWorkingTree(
    context: Context,
    measured = false,
  ): Promise<WorkingTree> {
    const workingTree = await workingTreeFiles(
      context.gitPath,
      context.root,
      undefined,
      undefined,
      undefined,
      measured,
    );
    context.post({ type: 'workingTree', files: uncommittedCount(workingTree) });
    return workingTree;
  }

  private async sendCommits(
    context: Context,
    refs: Promise<Refs>,
    keepPlace = false,
  ): Promise<void> {
    const read = await refs;
    const { head, refs: listed, stashes } = read;
    const { tab } = context;
    const early = tab.shown.commits === undefined;
    const loading = new AbortController();
    const loaded = Promise.withResolvers<void>();
    if (early) {
      tab.loadingHistory = loaded.promise;
      if (read.commitGraph) {
        void this.inFlight.track(
          this.sendRecentHistory(context, read, loading.signal),
        );
      }
    }
    const reading = new AbortController();
    tab.readingHistory = reading;
    try {
      const solo = this.storage.soloOf(context.root);
      const fullHistory = await this.listFullHistory(
        context,
        solo,
        stashes.map((stash) => stash.commit),
        tipsInGitOrder(head, listed, solo, stashes),
        AbortSignal.any([tab.closed.signal, reading.signal]),
      ).catch((error: unknown) => {
        if (tab.closed.signal.aborted || reading.signal.aborted) {
          return undefined;
        }
        throw error;
      });
      if (fullHistory === undefined) {
        return;
      }
      loading.abort();
      loadHistory(tab, fullHistory, head, listed, stashes, read.dates);
      tab.shallow = read.shallow;
      if (this.storage.soloOf(context.root) !== solo) {
        forgetHistory(tab);
      }
      if (tab.hash !== undefined && !stillThere(tab)(tab.hash)) {
        unselect(tab);
        context.post({ type: 'unselect', selection: tab.selection });
      }
      await this.sendShownHistory(context, { keepPlace: keepPlace || early });
    } finally {
      if (tab.readingHistory === reading) {
        tab.readingHistory = undefined;
      }
      loading.abort();
      loaded.resolve();
      if (tab.loadingHistory === loaded.promise) {
        tab.loadingHistory = undefined;
      }
    }
    const { back, forward } = tab.navigation;
    if (back.length + forward.length > 0) {
      await this.sendNavigation(context);
    }
  }

  private listFullHistory(
    context: Context,
    solo: boolean,
    stashes: readonly string[],
    tips: Iterable<string>,
    signal: AbortSignal,
  ): Promise<Commits> {
    return listHistory(
      context.gitPath,
      context.root,
      solo,
      stashes,
      signal,
      tips,
    );
  }

  private async listRecentHistory(
    context: Context,
    tips: readonly string[],
    stashes: readonly string[],
    signal: AbortSignal,
    count?: number,
  ): Promise<Commits | undefined> {
    const { history, whole } = await listRecentHistory(
      context.gitPath,
      context.root,
      tips,
      stashes,
      count,
      signal,
    );
    return whole ? undefined : history;
  }

  private async sendRecentHistory(
    context: Context,
    { head, refs, stashes, dates }: Refs,
    signal: AbortSignal,
  ): Promise<void> {
    const solo = this.storage.soloOf(context.root);
    try {
      const recent = await this.listRecentHistory(
        context,
        solo ? [] : recentTips(dates),
        solo ? [] : stashes.map((stash) => stash.commit),
        signal,
      );
      if (recent === undefined || signal.aborted) {
        return;
      }
      loadHistory(context.tab, recent, head, refs, stashes, dates, true);
      await this.sendShownHistory(context);
    } catch (error) {
      if (!signal.aborted) {
        this.log.error(strings.log.recentHistoryFailed);
        this.log.error(error);
      }
    }
  }

  private async sendShownHistory(
    context: Context,
    {
      scrollTo,
      keepPlace = false,
      layOut = true,
    }: { scrollTo?: string; keepPlace?: boolean; layOut?: boolean } = {},
  ): Promise<void> {
    const { tab } = context;
    const generation = layOut ? this.layOut(tab) : ++tab.generation;
    const page = firstPage(tab, keepPlace, scrollTo);
    const { graph } = tab;
    const [commits] = await Promise.all([
      logCommits(
        context.gitPath,
        context.root,
        tab.history.hashes(page.start, page.start + 2 * commitPageSize),
      ).catch((error: unknown) => {
        if (tab.generation === generation) {
          tab.shownStale = true;
        }
        throw error;
      }),
      graph.walkTo(page.start, () => tab.graph === graph),
    ]);
    keepSubjects(tab, commits);
    if (tab.generation !== generation) {
      return;
    }
    context.post(commitsMessage(tab, page, commits));
  }

  private layOut(tab: Tab): number {
    const started = performance.now();
    const generation = layOutHistory(
      tab,
      this.storage.collapseMerges,
      tab.headCommit,
    );
    this.log.info(
      strings.log.laidOut(
        tab.history.length,
        tab.fullHistory.length,
        Math.round(performance.now() - started),
      ),
    );
    const { graph } = tab;
    void this.inFlight.track(
      graph.walkAhead(() => tab.graph === graph && !tab.closed.signal.aborted),
    );
    return generation;
  }

  private async sendCommitPage(
    context: Context,
    generation: number,
    start: number,
    count: number,
  ): Promise<void> {
    const { tab } = context;
    const replaced = () => tab.generation !== generation;
    if (replaced()) {
      if (tab.shownStale) {
        await this.sendShownHistory(context, { keepPlace: true });
      }
      return;
    }
    const { history, graph } = tab;
    const walked = graph.walkTo(start, () => tab.graph === graph);
    const commits = await logCommits(
      context.gitPath,
      context.root,
      history.hashes(start, start + count),
    ).catch((error: unknown) => {
      if (!replaced()) {
        context.post({
          type: 'commitPage',
          generation,
          start,
          count,
          commits: [],
          graph: [],
        });
      }
      throw error;
    });
    keepSubjects(tab, commits);
    await walked;
    if (replaced()) {
      return;
    }
    context.post({
      type: 'commitPage',
      generation,
      start,
      count,
      commits,
      graph: graph.rows(start, commits.length),
    });
  }

  private async sendCommit(
    context: Context,
    knownWorkingTree?: WorkingTree,
  ): Promise<void> {
    const { tab } = context;
    const { hash } = tab;
    if (!hash) {
      return;
    }
    const refreshing = knownWorkingTree !== undefined;
    if (!refreshing) {
      tab.loadingFiles.abort();
      tab.loadingDiff.abort();
      tab.loadingFiles = new AbortController();
    }
    const { signal } = tab.loadingFiles;
    let files: readonly FileChange[];
    let staged: readonly FileChange[] | undefined;
    let workingTree: WorkingTree | undefined;
    let early: EarlyPatch | undefined;
    try {
      if (!stillThere(tab)(hash)) {
        this.notInHistory(context, hash);
        return;
      }
      if (workingTreeSide(hash)) {
        workingTree =
          (hash === workingTreeHash ? knownWorkingTree : undefined) ??
          (await workingTreeFiles(
            context.gitPath,
            context.root,
            workingTreeDiffOf(hash),
            signal,
            knownWorkingTree?.listedUntracked,
          ));
        files = workingTree.files;
        staged = workingTree.staged;
      } else {
        early = this.earlyPatch(context, hash, signal);
        files = await this.commitFiles(context, hash, signal);
      }
    } catch (error) {
      early?.loading.abort();
      if (signal.aborted) {
        return;
      }
      throw error;
    }
    if (tab.hash !== hash || signal.aborted) {
      early?.loading.abort();
      return;
    }
    context.tab.changedFiles = new Map(files.map((file) => [file.path, file]));
    context.tab.stagedFiles = new Map(
      (staged ?? []).map((file) => [file.path, file]),
    );
    if (staged !== undefined && context.tab.area === undefined) {
      context.tab.area = staged.length > 0 ? 'staged' : 'unstaged';
    }
    if (workingTree) {
      context.tab.workingTree = workingTree;
    }
    const shownFiles = context.tab.shown.files;
    const unchanged =
      shownFiles?.hash === hash &&
      JSON.stringify([shownFiles.files, shownFiles.staged]) ===
        JSON.stringify([files, staged]);
    if (!(refreshing && unchanged)) {
      context.post({
        type: 'files',
        hash,
        files,
        ...(staged === undefined ? {} : { staged }),
      });
    }
    await this.sendDiff(context, hash, refreshing, early);
  }

  private earlyPatch(
    context: Context,
    hash: string,
    signal: AbortSignal,
  ): EarlyPatch | undefined {
    if (context.tab.path !== undefined) {
      return undefined;
    }
    const loading = new AbortController();
    const patch = this.budgetedPatch(
      context,
      hash,
      AbortSignal.any([signal, loading.signal]),
    ).catch(() => undefined);
    return { patch, loading };
  }

  private budgetedPatch(
    context: Context,
    hash: string,
    signal: AbortSignal,
    scope: PatchScope = { ignoreWhitespace: this.storage.ignoreWhitespace },
  ): Promise<ReadPatch> {
    const compared = comparedOf(hash);
    const stash = context.tab.stashes.get(hash);
    const commands = compared
      ? [comparePatchArgs(compared.from, compared.to, scope)]
      : stash
        ? [
            showPatchArgs(stash.commit, scope),
            ...(stash.untracked === undefined
              ? []
              : [showPatchArgs(stash.untracked, scope)]),
          ]
        : [showPatchArgs(hash, scope)];
    return readPatch(
      context.gitPath,
      context.root,
      commands.map((args) => [...args, ...pathspecs(scope)]),
      signal,
    );
  }

  private async budgetedFilePatch(
    context: Context,
    hash: string,
    change: FileChange,
    scope: PatchScope,
    signal: AbortSignal,
  ): Promise<{ patch: string; leftOut: readonly LeftOut[] | undefined }> {
    const read = await this.budgetedPatch(context, hash, signal, scope);
    void this.inFlight.track(read.exited);
    const leftOut = leftOutOf(read, [change]);
    return {
      patch: withoutFilesInside(read.patch, scope),
      leftOut: leftOut.length === 0 ? undefined : leftOut,
    };
  }

  private async wholePatch(
    context: Context,
    hash: string,
    files: readonly FileChange[],
    early: Promise<ReadPatch | undefined> | undefined,
    signal: AbortSignal,
  ): Promise<{ patch: string; leftOut: readonly LeftOut[] }> {
    if (workingTreeSide(hash)) {
      const patch = await this.patchOf(
        context,
        hash,
        {
          include: includedChanges(files),
          ignoreWhitespace: this.storage.ignoreWhitespace,
        },
        signal,
      );
      return { patch, leftOut: leftOutChanges(files) };
    }
    const read =
      (await early) ?? (await this.budgetedPatch(context, hash, signal));
    void this.inFlight.track(read.exited);
    return { patch: read.patch, leftOut: leftOutOf(read, files) };
  }

  private commitFiles(
    context: Context,
    hash: string,
    signal: AbortSignal,
  ): Promise<FileChange[]> {
    const compared = comparedOf(hash);
    const stash = context.tab.stashes.get(hash);
    return compared
      ? compareFiles(
          context.gitPath,
          context.root,
          compared.from,
          compared.to,
          signal,
        )
      : stash
        ? stashFiles(context.gitPath, context.root, stash, signal)
        : showFiles(context.gitPath, context.root, hash, signal);
  }

  private async sendFileDiff(
    context: Context,
    hash: string,
    file: string,
    diff: number,
    shownPatch?: string,
  ): Promise<void> {
    const change = changesOf(context.tab).get(file);
    const { ignoreWhitespace } = this.storage;
    const scope = {
      path: file,
      oldPath: change?.oldPath,
      entireFile: this.showsEntire(context, file),
    };
    let patch = await this.patchOf(context, hash, {
      ...scope,
      ignoreWhitespace,
    });
    const whitespaceOnly =
      ignoreWhitespace &&
      change !== undefined &&
      whitespaceOnlyChanges(patch, [change]).length > 0;
    if (scope.entireFile && whitespaceOnly) {
      patch = newSideUnchanged(await this.patchOf(context, hash, scope));
    }
    if (context.tab.hash === hash && patch !== shownPatch) {
      context.post({
        type: 'fileDiff',
        hash,
        path: file,
        patch,
        diff,
        ...(whitespaceOnly ? { whitespaceOnly } : {}),
      });
    }
  }

  private showsEntire(context: Context, file: string | undefined): boolean {
    return (
      file !== undefined &&
      file === context.tab.path &&
      (context.tab.entireFile || this.storage.entireFilePinned)
    );
  }

  private async sendTexts(
    context: Context,
    { hash, diff, texts }: Extract<TabMessage, { type: 'loadTexts' }>,
  ): Promise<void> {
    const { gitPath, root } = context;
    const fromDisk = (request: TextRequest) =>
      context.tab.area !== 'staged' && request.side === workingTreeSide(hash);
    const blobs = await this.blobTexts.read(
      texts.filter((request) => !fromDisk(request)).map(({ blob }) => blob),
      (ids) => readBlobs(gitPath, root, ids),
    );
    const read = await Promise.all(
      texts.map(async (request) => {
        if (!fromDisk(request)) {
          return { ...request, text: blobs.get(request.blob) };
        }
        const onDisk =
          request.side === 'old'
            ? changesOf(context.tab).get(request.path)?.oldPath
            : undefined;
        const file = await readFile(
          gitPath,
          root,
          undefined,
          onDisk ?? request.path,
        );
        return { ...request, text: file.binary ? undefined : file.content };
      }),
    );
    if (context.tab.hash === hash) {
      context.post({ type: 'texts', hash, diff, texts: read });
    }
  }

  private async patchOf(
    context: Context,
    hash: string,
    scope: PatchScope,
    signal?: AbortSignal,
  ): Promise<string> {
    const { gitPath, root } = context;
    if (!workingTreeSide(hash)) {
      const compared = comparedOf(hash);
      const stash = context.tab.stashes.get(hash);
      return compared
        ? comparePatch(gitPath, root, compared.from, compared.to, scope, signal)
        : stash
          ? stashPatch(gitPath, root, stash, scope, signal)
          : showPatch(gitPath, root, hash, scope, signal);
    }
    if (context.tab.area === 'staged') {
      return stagedPatch(gitPath, root, scope, signal);
    }
    const workingTree =
      context.tab.workingTree ??
      (await workingTreeFiles(gitPath, root, workingTreeDiffOf(hash), signal));
    return workingTreePatch(
      gitPath,
      root,
      workingTree,
      scope,
      context.tab.untrackedPatches,
      signal,
    );
  }

  private async sendTree(
    context: Context,
    hash: string,
    refreshed?: WorkingTree,
  ): Promise<void> {
    const { gitPath, root } = context;
    const commit = shownCommit(hash);
    let paths: string[];
    if (refreshed === undefined || commit !== undefined) {
      paths = await listTree(gitPath, root, commit);
    } else {
      context.tab.indexPaths ??= await listIndex(gitPath, root);
      paths = uniquePaths(refreshed.untracked, context.tab.indexPaths);
    }
    if (context.tab.hash !== hash) {
      return;
    }
    const shown = context.tab.shown.tree;
    const unchanged =
      refreshed !== undefined &&
      shown?.hash === hash &&
      shown.paths.length === paths.length &&
      shown.paths.every((file, index) => file === paths[index]);
    if (!unchanged) {
      context.post({ type: 'tree', hash, paths });
    }
  }

  private async sendDiff(
    context: Context,
    hash: string,
    refreshing = false,
    early?: EarlyPatch,
  ): Promise<void> {
    const { tab } = context;
    const { path: file, area } = tab;
    const request = ++tab.diffRequest;
    if (!refreshing) {
      tab.diffOwed = true;
    }
    tab.loadingDiff.abort();
    const loading = new AbortController();
    tab.loadingDiff = loading;
    if (early) {
      if (file === undefined) {
        loading.signal.addEventListener('abort', () => early.loading.abort(), {
          once: true,
        });
      } else {
        early.loading.abort();
      }
    }
    const stale = () =>
      tab.diffRequest !== request ||
      tab.hash !== hash ||
      tab.path !== file ||
      tab.area !== area;
    const changes = changesOf(tab);
    const change = file === undefined ? undefined : changes.get(file);
    if (file !== undefined && !change) {
      const { content, binary, id } = await readFile(
        context.gitPath,
        context.root,
        shownCommit(hash),
        file,
      );
      const shownDiff = context.tab.shown.diff;
      const unchanged =
        !tab.diffOwed &&
        shownDiff?.type === 'fileContent' &&
        shownDiff.hash === hash &&
        shownDiff.path === file &&
        shownDiff.area === area &&
        shownDiff.content === content &&
        shownDiff.binary === binary &&
        shownDiff.id === id;
      if (!stale() && !unchanged) {
        tab.diffOwed = false;
        context.post({
          type: 'fileContent',
          hash,
          path: file,
          ...areaOf(area),
          content,
          binary,
          ...(id === undefined ? {} : { id }),
        });
      }
      return;
    }
    const { ignoreWhitespace } = this.storage;
    let patch: string;
    let leftOut: readonly LeftOut[] | undefined;
    let whitespaceOnly: string[] = [];
    try {
      const scope = { path: file, oldPath: change?.oldPath };
      const entireFile = this.showsEntire(context, file);
      const selectedLeftOut = change ? leftOutWhenSelected(change) : [];
      if (file === undefined) {
        ({ patch, leftOut } = await this.wholePatch(
          context,
          hash,
          [...changes.values()],
          early?.patch,
          loading.signal,
        ));
      } else if (selectedLeftOut.length > 0) {
        patch = '';
        leftOut = selectedLeftOut;
      } else if (change && !workingTreeSide(hash)) {
        ({ patch, leftOut } = await this.budgetedFilePatch(
          context,
          hash,
          change,
          { ...scope, entireFile, ignoreWhitespace },
          loading.signal,
        ));
      } else {
        patch = await this.patchOf(
          context,
          hash,
          { ...scope, entireFile, ignoreWhitespace },
          loading.signal,
        );
      }
      if (ignoreWhitespace) {
        const deferred = new Set(leftOut?.map((out) => out.path));
        whitespaceOnly = whitespaceOnlyChanges(
          patch,
          (change ? [change] : [...changes.values()]).filter(
            (shown) => !deferred.has(shown.path),
          ),
        );
      }
      if (entireFile && whitespaceOnly.length > 0) {
        patch = newSideUnchanged(
          await this.patchOf(
            context,
            hash,
            { ...scope, entireFile },
            loading.signal,
          ),
        );
      }
    } catch (error) {
      if (loading.signal.aborted) {
        return;
      }
      throw error;
    }
    const shownDiff = context.tab.shown.diff;
    const unchanged =
      !tab.diffOwed &&
      shownDiff?.type === 'diff' &&
      shownDiff.hash === hash &&
      shownDiff.path === file &&
      shownDiff.area === area &&
      shownDiff.patch === patch &&
      JSON.stringify(shownDiff.leftOut) === JSON.stringify(leftOut) &&
      JSON.stringify(shownDiff.whitespaceOnly ?? []) ===
        JSON.stringify(whitespaceOnly);
    if (stale()) {
      return;
    }
    if (!unchanged) {
      tab.diffOwed = false;
      context.post({
        type: 'diff',
        hash,
        path: file,
        ...areaOf(area),
        patch,
        ...(leftOut === undefined ? {} : { leftOut }),
        ...(whitespaceOnly.length === 0 ? {} : { whitespaceOnly }),
      });
    } else {
      await this.sendFileDiffsAgain(context, hash);
    }
  }

  private async sendFileDiffsAgain(
    context: Context,
    hash: string,
  ): Promise<void> {
    const { shown } = context.tab;
    const changes = changesOf(context.tab);
    await Promise.all(
      [...(shown.fileDiffs?.values() ?? [])]
        .filter((sent) => sent.hash === hash && changes.has(sent.path))
        .map((sent) =>
          this.sendFileDiff(context, hash, sent.path, sent.diff, sent.patch),
        ),
    );
  }
}

function leftOutWhenSelected(change: FileChange): LeftOut[] {
  const measured = !change.uncounted || change.bytes !== undefined;
  return measured ? leftOutChanges([change]) : [];
}

function workingTreeDiffOf(hash: string): WorkingTreeDiff | undefined {
  const compared = comparedOf(hash);
  if (!compared) {
    return undefined;
  }
  return compared.to === workingTreeHash
    ? { base: compared.from, reverse: false }
    : { base: compared.to, reverse: true };
}

function needsNoWholeHistory(tab: TabState, message: TabMessage): boolean {
  switch (message.type) {
    case 'loadCommits':
    case 'showEntireFile':
    case 'fetch':
    case 'pull':
    case 'push':
    case 'pushTag':
    case 'pullBranch':
    case 'pushBranch':
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

function areaOf(area: ChangeArea | undefined): { area?: ChangeArea } {
  return area === undefined ? {} : { area };
}

function shownCommit(hash: string): string | undefined {
  const shown = shownSide(hash);
  return shown === workingTreeHash ? undefined : shown;
}

async function allSettled(
  promises: readonly Promise<unknown>[],
): Promise<void> {
  const failed = (await Promise.allSettled(promises)).find(
    (result) => result.status === 'rejected',
  );
  if (failed) {
    throw failed.reason;
  }
}

export function tabInfos(
  roots: readonly string[],
  paths: path.PlatformPath = path,
): TabInfo[] {
  const same = (name: string) =>
    paths.sep === '\\' ? name.toLowerCase() : name;
  const tabs = roots.map((root) => ({
    root,
    name: tabName(root, paths),
    above: foldersAbove(namedFolder(root, paths), paths),
  }));
  return tabs.map(({ root, name, above }) => {
    const levels = new Set<number>();
    for (const other of tabs) {
      if (other.root === root || same(other.name) !== same(name)) {
        continue;
      }
      const level = above.findIndex(
        (folder, index) =>
          other.above[index] === undefined ||
          same(other.above[index]) !== same(folder),
      );
      if (level !== -1) {
        levels.add(level);
      }
    }
    if (levels.size === 0) {
      return { root, name };
    }
    const shown = [...levels].toSorted((a, b) => b - a);
    const folders = shown.flatMap((level, index) =>
      index > 0 && shown[index - 1] - level > 1
        ? ['…', above[level]]
        : [above[level]],
    );
    return { root, name, folder: paths.join(...folders) };
  });
}

function namedFolder(root: string, paths: path.PlatformPath): string {
  const name = paths.basename(root);
  return name === '.bare' || name === '.git'
    ? namedFolder(paths.dirname(root), paths)
    : root;
}

function foldersAbove(folder: string, paths: path.PlatformPath): string[] {
  const parent = paths.dirname(folder);
  return parent === folder
    ? []
    : [paths.basename(parent) || parent, ...foldersAbove(parent, paths)];
}

export function tabName(root: string, paths: path.PlatformPath = path): string {
  const folder = namedFolder(root, paths);
  return paths.basename(folder).replace(/(.)\.git$/, '$1') || folder;
}

function worktreeInfos(worktrees: readonly Worktree[]): WorktreeInfo[] {
  const [first] = worktrees;
  const main = first !== undefined && !first.bare;
  return worktrees
    .filter((worktree) => !worktree.bare)
    .map((worktree, index) => ({
      root: worktree.path,
      name:
        worktree.branch ??
        (worktree.head === undefined
          ? tabName(worktree.path)
          : shortHash(worktree.head)),
      folder: path.basename(worktree.path),
      main: main && index === 0,
      missing: worktree.missing,
    }));
}
