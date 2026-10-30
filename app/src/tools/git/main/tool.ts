import * as path from 'node:path';
import { AutoFetch, fetchOrder, type Timer } from './autoFetch';
import { readUpstream, remoteDefaultBranches } from './cli/branches';
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
} from './cli/diff';
import { gitErrorText } from './cli/errorText';
import { BlobTexts } from './cli/blobTexts';
import {
  listIndex,
  listTree,
  readBlobs,
  readFile,
  readImage,
  uniquePaths,
} from './cli/files';
import { stashFiles, stashPatch } from './cli/stashes';
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
} from './cli/history';
import type { Commits } from './history/commits';
import {
  fetchRemote,
  isFolder,
  listRemoteTags,
  listRemotes,
  readHead,
  readRefs,
  remotesNotFetched,
  repositoryRoot,
  spellingOf,
  type Head,
  type Refs,
} from './cli/repository';
import {
  isWatchFailure,
  watchRepository,
  type Changed,
  type Watcher,
} from './cli/watch';
import {
  stagedPatch,
  uncommittedCount,
  UntrackedPatches,
  workingTreeFiles,
  workingTreePatch,
  type WorkingTree,
  type WorkingTreeDiff,
} from './cli/workingTree';
import {
  listWorktrees,
  locateRepository,
  type Location,
  type Worktree,
} from './cli/worktrees';
import { step, visit } from './history/navigation';
import { ImageReads } from './imageReads';
import type { Log } from '../../../shell/main/log';
import {
  canPull,
  checkout,
  fastForwardToUpstream,
  fetchAll,
  foundUpstream,
  pickTagRemote,
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
import { comparedOf, shownSide, workingTreeSide } from '../shared/comparisons';
import { isFullHash, shortHash } from '../shared/hashes';
import { bookmarkedCommits, hasRef } from '../shared/refNames';
import { imageSourceOf, imageType } from '../shared/images';
import {
  commitPageSize,
  includedChanges,
  leftOutChanges,
  workingTreeHash,
  type ChangeArea,
  type CheckoutTarget,
  type CommitResults,
  type CommitSearch,
  type Direction,
  type FileChange,
  type LeftOut,
  type RepositoryInfo,
  type TabMessage,
  type TextRequest,
  type GitToHost,
  type GitToWebview,
  type WorktreeInfo,
} from '../shared/protocol';
import type { ToWebviewOf } from '../../../shell/shared/protocol';
import {
  unattachedShell,
  type Page,
  type ShellAccess,
  type Tab,
  type TabName,
  type Tool,
} from '../../../shell/main/shell';
import { strings } from '../../../shared/strings';
import { sameRoot } from '../../../shell/main/storage';
import { isBookmark, type GitStorage } from './storage';
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
  stashesKeepHistory,
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

interface TabWork extends TabState {
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
  refused: boolean;
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

export interface GitHost {
  chooseFolders(): Promise<readonly string[]>;
}

type GitPost = GitToWebview | ToWebviewOf<'notice'>;

interface Session {
  readonly page: Page;
  readonly post: (message: GitPost) => void;
  readonly disposed: boolean;
  watcher: Watcher | undefined;
  watching: AbortController | undefined;
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
  readonly ignoreWhitespace: boolean;
}

interface Fetchable extends RepositoryAt {
  readonly repository: string;
}

interface Context extends Fetchable {
  readonly tab: TabWork;
  readonly session: Session | undefined;
  readonly post: (message: GitPost) => void;
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

export class GitTool implements Tool<'git'> {
  private shell: ShellAccess = unattachedShell;
  private readonly sessions = new WeakMap<Page, Session>();
  private readonly tabStates = new Map<string, TabWork>();
  private readonly blobTexts = new BlobTexts();
  private readonly repositories = new Map<string, string>();
  private readonly worktreeLists = new Map<string, readonly WorktreeInfo[]>();
  private readonly worktreeListings = new Map<string, number>();
  private readonly fetches = new Map<string, Fetching>();
  private readonly pushes = new Map<string, Promise<unknown>>();
  private readonly fetchFailures = new Set<string>();
  private readonly commitSearches = new Map<string, AbortController>();
  private readonly hashLookups = new Map<string, number>();
  private readonly imageReads = new ImageReads();
  private readonly autoFetch: AutoFetch;
  private readonly quitting = new AbortController();
  private collapseMerges: boolean;
  private soloDefault: boolean;

  constructor(
    private readonly log: Log,
    private readonly gitPath: string,
    private readonly storage: GitStorage,
    private readonly host: GitHost,
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
      () => fetchOrder(this.repositoryTabs, this.activeRepository),
      (root) => this.shell.track(this.fetchInBackground(root)),
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

  attach(shell: ShellAccess): void {
    this.shell = shell;
  }

  ready(page: Page): void {
    const session = this.sessionOf(page);
    session.post(this.storage.layout);
    this.sendRecent(session);
  }

  async show(page: Page, tab: Tab): Promise<void> {
    const { root } = tab;
    if (root === undefined) {
      return;
    }
    const session = this.sessionOf(page);
    await this.run(
      strings.log.showingTabFailed(root),
      session,
      () => this.openTab(session, root),
      this.storage.worktreeOf(root),
    );
  }

  shows(page: Page): boolean {
    return this.showsActiveTab(this.sessionOf(page));
  }

  hide(page: Page): void {
    const session = this.sessionOf(page);
    this.stopWatching(session);
    this.postTabs(session);
  }

  async preload(page: Page, tab: Tab): Promise<void> {
    const { root } = tab;
    if (root === undefined) {
      return;
    }
    const session = this.sessionOf(page);
    await this.run(strings.log.preloadingFailed(root), session, () =>
      allSettled([
        this.loadWorktrees(session, root),
        this.preloadRoot(session, this.storage.worktreeOf(root), root),
      ]),
    );
  }

  closed(page: Page, tab: Tab): void {
    const { root: closed } = tab;
    if (closed === undefined) {
      return;
    }
    for (const [root, state] of this.tabStates) {
      if (sameRoot(this.repositoryOf(root), closed)) {
        this.forgetTab(root, state);
      }
    }
    this.sendRecent(this.sessionOf(page));
  }

  receive(page: Page, message: GitToHost): Promise<void> {
    const session = this.sessionOf(page);
    return this.run(
      strings.log.handlingFailed(message.type),
      session,
      () => this.handle(message, session),
      this.worktreeAsked(message),
    );
  }

  refreshShown(page: Page): Promise<void> {
    const session = this.sessionOf(page);
    return this.run(strings.log.refreshingFailed, session, async () => {
      const context = await this.context(session);
      if (context) {
        await this.refresh(context);
      }
    });
  }

  names(tabs: readonly Tab[]): ReadonlyMap<string, TabName> {
    const infos = tabInfos(tabs.flatMap((tab) => tab.root ?? []));
    return new Map(
      tabs.flatMap((tab) => {
        const info = infos.find((other) => other.root === tab.root);
        return info === undefined
          ? []
          : [
              [
                tab.id,
                {
                  name: info.name,
                  ...(info.folder !== undefined && { folder: info.folder }),
                },
              ],
            ];
      }),
    );
  }

  async fits(folder: string): Promise<boolean> {
    try {
      return (await locateRepository(this.gitPath, folder)) !== undefined;
    } catch {
      return false;
    }
  }

  folderOf(tab: Tab): string | undefined {
    return tab.root === undefined
      ? undefined
      : this.storage.worktreeOf(tab.root);
  }

  visited(): void {}

  open(page: Page, folders: readonly string[]): Promise<void> {
    const session = this.sessionOf(page);
    return this.run(strings.log.openingAskedFailed, session, () =>
      this.openRepositories(session, folders),
    );
  }

  newTab(page: Page): Promise<void> {
    const session = this.sessionOf(page);
    return this.run(strings.log.openingAskedFailed, session, async () =>
      this.openRepositories(session, await this.host.chooseFolders()),
    );
  }

  idle(): Promise<void> {
    return this.shell.idle();
  }

  private sessionOf(page: Page): Session {
    const known = this.sessions.get(page);
    if (known !== undefined) {
      return known;
    }
    const session: Session = {
      page,
      post: (message) => {
        if (message.type === 'notice') {
          this.shell.notice(page, {
            level: message.level,
            message: message.message,
          });
        } else {
          page.post({ type: 'tool', tool: 'git', message });
        }
      },
      get disposed() {
        return page.disposed;
      },
      watcher: undefined,
      watching: undefined,
    };
    this.sessions.set(page, session);
    return session;
  }

  private get page(): Session | undefined {
    const page = this.shell.page();
    return page === undefined ? undefined : this.sessionOf(page);
  }

  private get repositoryTabs(): string[] {
    return this.shell
      .tabs()
      .flatMap((tab) =>
        tab.tool === 'git' && tab.root !== undefined ? [tab.root] : [],
      );
  }

  private get activeRepository(): string | undefined {
    const active = this.shell.active();
    return active?.tool === 'git' ? active.root : undefined;
  }

  private get activeWorktree(): string | undefined {
    const repository = this.activeRepository;
    return repository === undefined
      ? undefined
      : this.storage.worktreeOf(repository);
  }

  private hasRepository(root: string): boolean {
    return this.repositoryTabs.some((open) => sameRoot(open, root));
  }

  image(url: URL): Promise<Response> {
    return this.shell.track(this.readImage(url));
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
    const active = this.activeWorktree;
    return active !== undefined && sameRoot(active, root);
  }

  private showsActiveTab(session: Session): boolean {
    const active = this.activeWorktree;
    return (
      this.page === session &&
      active !== undefined &&
      this.tabStates.get(active)?.isRepository !== false &&
      this.tabStates.get(active)?.refused !== true
    );
  }

  private isActiveRepository(repository: string): boolean {
    const active = this.activeRepository;
    return active !== undefined && sameRoot(active, repository);
  }

  private repositoryOf(root: string): string {
    return this.repositories.get(root) ?? root;
  }

  private knownRoot(root: string): string {
    return (
      [
        ...this.tabStates.keys(),
        ...this.repositories.keys(),
        ...this.repositoryTabs,
      ].find((known) => sameRoot(known, root)) ?? root
    );
  }

  private bookmarkedOf(repository: string): Set<string> {
    return bookmarkedCommits(this.storage.bookmarksOf(repository) ?? []);
  }

  private async showBookmarked(
    session: Session,
    repository: string,
  ): Promise<void> {
    for (const [root, tab] of this.tabStates) {
      if (this.repositoryOf(root) !== repository || !historyLoaded(tab)) {
        continue;
      }
      if (!this.isActive(root)) {
        tab.shownStale = true;
        continue;
      }
      const context = await this.context(session, root);
      if (context) {
        await tab.loadingHistory;
        await this.sendShownHistory(context, {
          keepPlace: true,
          layOut: false,
        });
      }
    }
  }

  private worktreeAsked(message: GitToHost): string | undefined {
    switch (message.type) {
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
    return this.shell.track(this.runNow(failed, session, action, root));
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

  private async handle(message: GitToHost, session: Session): Promise<void> {
    const { storage } = this;
    switch (message.type) {
      case 'selectWorktree': {
        const repository = this.activeRepository;
        const root = this.knownRoot(message.root);
        if (
          repository === undefined ||
          !sameRoot(this.repositoryOf(root), repository) ||
          (this.isActive(root) && this.showsActiveTab(session))
        ) {
          return;
        }
        this.save(storage.setWorktree(repository, root));
        await this.openTab(session, repository);
        return;
      }
      case 'openRepository': {
        const recent = storage.recent.find((root) =>
          sameRoot(root, message.root),
        );
        if (recent !== undefined) {
          await this.openRepositories(session, [recent], true);
        }
        return;
      }
      case 'browseRepositories':
        await this.openRepositories(session, await this.host.chooseFolders());
        return;
      case 'forgetRecent':
        await this.storage.removeRecent(message.root);
        this.sendTabs(session);
        return;
      case 'preloadWorktree': {
        const repository = this.activeRepository;
        const root = this.knownRoot(message.root);
        if (
          repository !== undefined &&
          sameRoot(this.repositoryOf(root), repository) &&
          !this.isActive(root)
        ) {
          await this.preloadRoot(session, root, repository);
        }
        return;
      }
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
        const root = this.knownRoot(message.root);
        if (!this.hasRepository(this.repositoryOf(root))) {
          return;
        }
        const context = await this.context(session, root);
        this.save(storage.setSolo(root, message.solo));
        if (!context) {
          return;
        }
        context.post({ type: 'solo', solo: message.solo });
        context.post({ type: 'applyingSolo', running: true });
        try {
          forgetHistory(context.tab);
          context.tab.readingHistory?.abort();
          if (this.isActive(root)) {
            await this.refresh(context, () =>
              this.sendCommits(context, this.refsOf(context), true),
            );
          }
        } finally {
          context.post({ type: 'applyingSolo', running: false });
        }
        return;
      }
      case 'setBookmarks': {
        const repository = this.repositoryOf(this.knownRoot(message.root));
        if (
          !this.hasRepository(repository) ||
          !Array.isArray(message.bookmarks) ||
          !message.bookmarks.every(isBookmark)
        ) {
          return;
        }
        const before = this.bookmarkedOf(repository);
        this.save(storage.setBookmarks(repository, message.bookmarks));
        const after = this.bookmarkedOf(repository);
        if (
          before.size !== after.size ||
          [...before].some((hash) => !after.has(hash))
        ) {
          await this.showBookmarked(session, repository);
        }
        return;
      }
      case 'scrolled': {
        const tab = this.tabStates.get(this.knownRoot(message.root));
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
        await this.searchCommits(
          session,
          this.knownRoot(message.root),
          message.query,
        );
        return;
      case 'stopCommitSearch':
        this.commitSearches.get(this.knownRoot(message.root))?.abort();
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
    const page = () => (session.disposed ? (this.page ?? session) : session);
    const repositories = await this.addRepositories(session, folders, reopened);
    this.sendRecent(page());
    await this.shell.open(page().page, 'git', repositories, true);
  }

  private async addRepositories(
    session: Session,
    folders: readonly string[],
    reopened = false,
  ): Promise<string[]> {
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
      const repository = await spellingOf(
        location.repository,
        this.repositoryTabs,
      );
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
      this.shell.visited(worktree ?? repository);
    }
    return repositories;
  }

  private async openTab(session: Session, active: string): Promise<void> {
    if (session.disposed) {
      return;
    }
    this.postTabs(session);
    const worktree = this.storage.worktreeOf(active);
    this.repositories.set(worktree, active);
    const tab = this.tabState(worktree);
    try {
      await allSettled([
        this.loadWorktrees(session, active),
        this.openWorktree(session, worktree),
      ]);
      tab.refused = false;
    } catch (error) {
      tab.refused = true;
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
    const active = this.activeWorktree;
    for (const [root, tab] of this.tabStates) {
      if (
        sameRoot(this.repositoryOf(root), repository) &&
        !listed.some((worktree) => sameRoot(worktree.path, root)) &&
        (active === undefined || !sameRoot(active, root))
      ) {
        this.forgetTab(root, tab);
      }
    }
    for (const [root, owner] of this.repositories) {
      if (
        sameRoot(owner, repository) &&
        !sameRoot(root, repository) &&
        !listed.some((worktree) => sameRoot(worktree.path, root)) &&
        (active === undefined || !sameRoot(active, root))
      ) {
        this.repositories.delete(root);
      }
    }
  }

  private forgetTab(root: string, tab: TabWork): void {
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

  private async preloadRoot(
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
    const active = this.activeRepository;
    const worktree = this.activeWorktree;
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
    const active = this.activeRepository;
    session.post({
      type: 'worktrees',
      worktree: this.activeWorktree,
      worktrees: active === undefined ? [] : this.worktreeLists.get(active),
    });
    this.sendRecent(session);
  }

  private sendRecent(session: Session): void {
    session.post({
      type: 'recent',
      recent: tabInfos(
        this.storage.recent.filter(
          (root) =>
            !this.hasRepository(root) &&
            !this.hasRepository(this.repositoryOf(root)),
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

  private tabState(root: string): TabWork {
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
        refused: false,
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
    root = this.activeWorktree,
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
        if (message.type !== 'notice') {
          keep(tab.shown, message);
        }
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
      void this.shell.track(watcher.dispose());
      return;
    }
    session.watcher = watcher;
    if (performance.now() - started > this.delays.delay) {
      void this.shell.track(this.loadWorktrees(session, context.repository));
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
      void this.shell.track(watcher.dispose());
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
        void this.shell.track(this.loadWorktrees(session, context.repository)),
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
          (await this.fetchedForPull(context, fetched)) &&
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

  private async fetchedForPull(
    context: Context,
    fetched: Fetched,
    branch?: string,
  ): Promise<boolean> {
    if (!fetched.failed) {
      return true;
    }
    const upstream = await readUpstream(
      context.gitPath,
      context.root,
      branch,
    ).catch(() => undefined);
    if (upstream?.kind !== 'found') {
      return false;
    }
    return (
      upstream.remote === '.' ||
      this.afterRemoteWork(context.repository, () =>
        fetchRemote(context.gitPath, context.root, upstream.remote, {
          stop: this.quitting.signal,
        }),
      ).then(
        () => true,
        () => false,
      )
    );
  }

  private async push(context: Context): Promise<void> {
    await context.tab.movingHead;
    const head = await readHead(context.gitPath, context.root).catch(
      () => undefined,
    );
    context.post({ type: 'pushing', running: true });
    let pushed: Pushed;
    try {
      pushed = await this.pushAfterRemoteWork(context, head);
    } finally {
      context.post({ type: 'pushing', running: false });
    }
    if (pushed === 'pushed') {
      await this.refresh(context, undefined, refsAlone);
    } else if (pushed === 'rejected') {
      await this.fetch(context);
    }
  }

  private async pushAfterRemoteWork(
    context: Context,
    head: Head | undefined,
  ): Promise<Pushed> {
    if (head !== undefined && head.name === undefined) {
      foundUpstream(this.notify(context), { kind: 'detached' });
      return 'unchanged';
    }
    return this.afterRemoteWork(context.repository, () =>
      pushToUpstream(
        this.log,
        this.notify(context),
        context,
        this.quitting.signal,
        head?.name,
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
          (await this.fetchedForPull(context, fetched, name)) &&
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
    const remote = await pickTagRemote(
      this.log,
      this.notify(context),
      context,
      name,
      remotes,
    );
    if (remote === undefined) {
      return;
    }
    if (
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
          remote,
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
    return running.length === 0 ? undefined : Promise.allSettled(running);
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
    const notFetched = result.failed
      ? remotesNotFetched(gitErrorText(result.error))
      : [];
    if (fetched || notFetched.length > 0) {
      void this.shell.track(
        this.listTagsOfRemotes(at, interactive, notFetched),
      );
    }
    return result;
  }

  private async listTagsOfRemotes(
    { gitPath, root, repository }: Fetchable,
    interactive: boolean,
    notFetched: readonly string[] = [],
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
    for (const remote of remotes.filter((name) => !notFetched.includes(name))) {
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
      !this.hasRepository(repository) ||
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
      this.hasRepository(repository) &&
      this.postToPage(session, {
        type: 'notice',
        level,
        message: strings.messages.inTab(this.tabLabel(repository), message),
      });
  }

  private tabLabel(repository: string): string {
    const tab = tabInfos(this.repositoryTabs).find((info) =>
      sameRoot(info.root, repository),
    );
    return strings.tabs.label(tab?.name ?? tabName(repository), tab?.folder);
  }

  private postToPage(session: Session, message: GitPost): void {
    if (message.type === 'notice') {
      this.shell.notice(session.page, {
        level: message.level,
        message: message.message,
      });
      return;
    }
    (session.disposed ? this.page : session)?.post(message);
  }

  private visit(context: Context, hash: string, replace = false): void {
    const { tab } = context;
    const next = visit(tab.navigation, tab.hash, hash, replace);
    if (next !== tab.navigation) {
      tab.navigation = next;
      void this.shell.track(
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
      const result = await this.commitsMatching(
        context,
        query,
        search.signal,
      ).catch((error: unknown) => {
        if (!search.signal.aborted) {
          context.post({
            type: 'commitSearch',
            query,
            result: { commits: [], capped: false },
          });
        }
        throw error;
      });
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
    const answer = (result: CommitResults) => {
      if (this.hashLookups.get(context.root) === lookup) {
        context.post({ type: 'hashLookup', query, result });
      }
    };
    answer(
      await this.commitsStartingWith(context, query).catch((error: unknown) => {
        answer({ commits: [], more: 0 });
        throw error;
      }),
    );
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

  private async runRefreshes(tab: TabWork, first: Refresh): Promise<void> {
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

  private queuedRefresh(tab: TabWork): Refresh | undefined {
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
    if (!stashesKeepHistory(tab, stashes, solo)) {
      return undefined;
    }
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
        void this.shell.track(
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
    context.post(
      commitsMessage(tab, page, commits, this.bookmarkedOf(context.repository)),
    );
  }

  private layOut(tab: TabWork): number {
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
    void this.shell.track(
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
    let all: readonly FileChange[] | undefined;
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
        all = workingTree.all?.files;
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
    context.tab.allFiles =
      all === undefined
        ? undefined
        : new Map(all.map((file) => [file.path, file]));
    if (workingTree) {
      context.tab.workingTree = workingTree;
    }
    const shownFiles = context.tab.shown.files;
    const unchanged =
      shownFiles?.hash === hash &&
      JSON.stringify([shownFiles.files, shownFiles.staged, shownFiles.all]) ===
        JSON.stringify([files, staged, all]);
    if (!(refreshing && unchanged)) {
      context.post({
        type: 'files',
        hash,
        files,
        ...(staged === undefined ? {} : { staged }),
        ...(all === undefined ? {} : { all }),
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
    const { ignoreWhitespace } = this.storage;
    const patch = this.budgetedPatch(
      context,
      hash,
      AbortSignal.any([signal, loading.signal]),
      { ignoreWhitespace },
    ).catch(() => undefined);
    return { patch, loading, ignoreWhitespace };
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
    void this.shell.track(read.exited);
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
    void this.shell.track(read.exited);
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
    { hash, diff, texts: asked }: Extract<TabMessage, { type: 'loadTexts' }>,
  ): Promise<void> {
    const { gitPath, root } = context;
    const texts = [
      ...new Map(
        asked.map((request) => [`${request.side}\0${request.path}`, request]),
      ).values(),
    ];
    const fromDisk = (request: TextRequest) =>
      context.tab.area !== 'staged' && request.side === workingTreeSide(hash);
    const blobs = await this.blobTexts.read(
      texts
        .filter((request) => !fromDisk(request) && isFullHash(request.blob))
        .map(({ blob }) => blob),
      (ids) => readBlobs(gitPath, root, ids),
    );
    const read = await Promise.all(
      texts.map(async (request) => {
        if (!fromDisk(request)) {
          return {
            ...request,
            text: isFullHash(request.blob)
              ? blobs.get(request.blob)
              : undefined,
          };
        }
        const onDisk =
          (request.side === 'old'
            ? changesOf(context.tab).get(request.path)?.oldPath
            : undefined) ?? request.path;
        if (!(await this.inWorkingTree(context, onDisk))) {
          return { ...request, text: undefined };
        }
        const file = await readFile(gitPath, root, undefined, onDisk);
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
      (context.tab.area === undefined ? workingTree.all : undefined) ??
        workingTree,
      scope,
      context.tab.untrackedPatches,
      signal,
    );
  }

  private async inWorkingTree(
    context: Context,
    file: string,
  ): Promise<boolean> {
    const { tab } = context;
    if (
      [tab.changedFiles, tab.stagedFiles].some((changes) =>
        [...changes.values()].some(
          (change) => change.path === file || change.oldPath === file,
        ),
      ) ||
      tab.workingTree?.untracked.includes(file)
    ) {
      return true;
    }
    tab.indexPaths ??= await listIndex(context.gitPath, context.root);
    return tab.indexPaths.includes(file);
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
      if (
        file === undefined &&
        early.ignoreWhitespace === this.storage.ignoreWhitespace
      ) {
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
      const commit = shownCommit(hash);
      const { content, binary, id, link } =
        commit === undefined && !(await this.inWorkingTree(context, file))
          ? { content: '', binary: false, id: undefined, link: undefined }
          : await readFile(context.gitPath, context.root, commit, file);
      const shownDiff = context.tab.shown.diff;
      const unchanged =
        !tab.diffOwed &&
        shownDiff?.type === 'fileContent' &&
        shownDiff.hash === hash &&
        shownDiff.path === file &&
        shownDiff.area === area &&
        shownDiff.content === content &&
        shownDiff.binary === binary &&
        shownDiff.id === id &&
        shownDiff.link === link;
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
          ...(link ? { link } : {}),
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
          early?.ignoreWhitespace === this.storage.ignoreWhitespace
            ? early.patch
            : undefined,
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
): RepositoryInfo[] {
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
        ? [strings.symbols.foldersLeftOut, above[level]]
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
