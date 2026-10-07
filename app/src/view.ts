import * as path from 'node:path';
import { AutoFetch, fetchOrder, type Timer } from './autoFetch';
import { readUpstream, remoteDefaultBranches } from './git/branches';
import {
  compareFiles,
  comparePatch,
  showFiles,
  showPatch,
  type PatchScope,
} from './git/diff';
import { gitErrorText } from './git/errorText';
import { listTree, readBlobs, readFile } from './git/files';
import { stashFiles, stashPatch } from './git/stashes';
import {
  findCommit,
  findCommits,
  headCommit,
  listHistory,
  logCommits,
  searchCommits,
} from './git/history';
import {
  isFolder,
  readRefs,
  repositoryRoot,
  sameFolder,
  type Refs,
} from './git/repository';
import { watchRepository, type Watcher } from './git/watch';
import {
  stagedPatch,
  uncommittedCount,
  workingTreeFiles,
  workingTreePatch,
  type UntrackedPatches,
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
import type { Log } from './log';
import {
  checkout,
  fetchAll,
  reportFetched,
  type Fetched,
  type Notify,
  type RepositoryAt,
} from './operations';
import { defaultBookmarks, fingerprint } from './refs';
import { comparedOf, shownSide } from './shared/comparisons';
import { isFullHash, shortHash } from './shared/hashes';
import { InFlight } from './shared/inFlight';
import {
  commitPageSize,
  deferredChanges,
  workingTreeHash,
  type ChangeArea,
  type CheckoutTarget,
  type CommitSearch,
  type Direction,
  type FileChange,
  type TabInfo,
  type TabMessage,
  type TextRequest,
  type ToHost,
  type ToWebview,
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
  refsKeepHistory,
  replayOf,
  select,
  stillThere,
  takeRefs,
  toggleMerges,
  unselect,
  type TabState,
} from './tabState';

const refreshDelays = { delay: 300, maxDelay: 1500 };

interface Tab extends TabState {
  preloading: Promise<void> | undefined;
  refreshing: boolean;
  refreshAgain: Map<Session | undefined, Context>;
  checkRefsAgain: boolean;
  refreshedAgain: PromiseWithResolvers<void> | undefined;
  loadsAgain: Refresh[];
  refreshError: string | undefined;
  isRepository: boolean;
  selection: number | undefined;
  navigating: Promise<void>;
  checkingOut: Promise<void>;
  diffRequest: number;
  diffOwed: boolean;
  loadingFiles: AbortController;
  loadingDiff: AbortController;
  untrackedPatches: UntrackedPatches;
}

export interface Host {
  chooseFolders(): Promise<readonly string[]>;
  openSettings(): Promise<void>;
  openDefaultSettings(): Promise<void>;
  settingsProblems(): readonly string[];
}

export interface Connection {
  receive(message: ToHost): Promise<void>;
  refresh(): Promise<void>;
  dispose(): void;
}

interface Session {
  readonly post: (message: ToWebview) => void;
  watcher: Watcher | undefined;
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

interface Context extends RepositoryAt {
  readonly repository: string;
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

export class FastforwardView {
  private readonly tabStates = new Map<string, Tab>();
  private readonly repositories = new Map<string, string>();
  private readonly worktreeLists = new Map<string, readonly WorktreeInfo[]>();
  private grouped: Promise<void> | undefined;
  private readonly fetches = new Map<string, Fetching>();
  private readonly fetchFailures = new Set<string>();
  private readonly commitSearches = new Map<string, AbortController>();
  private readonly hashLookups = new Map<string, number>();
  private page: Session | undefined;
  private readonly inFlight = new InFlight();
  private readonly autoFetch: AutoFetch;
  private collapseMerges: boolean;

  constructor(
    private readonly log: Log,
    private readonly gitPath: string,
    private readonly storage: Storage,
    private readonly host: Host,
    timer?: Timer,
    private readonly delays: {
      delay: number;
      maxDelay: number;
    } = refreshDelays,
  ) {
    this.collapseMerges = storage.collapseMerges;
    this.autoFetch = new AutoFetch(
      () => storage.autoFetchMinutes,
      () => fetchOrder(storage.tabs, storage.activeTab),
      (root) => this.inFlight.track(this.fetchInBackground(root)),
      timer,
    );
    this.autoFetch.update();
  }

  reloadSettings(): void {
    this.autoFetch.update();
    const collapseChanged = this.storage.collapseMerges !== this.collapseMerges;
    this.collapseMerges = this.storage.collapseMerges;
    for (const tab of this.tabStates.values()) {
      forgetHistory(tab);
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
      disposed: false,
    };
    return {
      receive: (message) =>
        this.run(
          message.type,
          session,
          () => this.handle(message, session),
          this.worktreeAsked(message),
        ),
      refresh: () =>
        this.run('refresh', session, async () => {
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

  private isActive(root: string): boolean {
    const active = this.storage.activeWorktree;
    return active !== undefined && sameRoot(active, root);
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
    name: string,
    session: Session,
    action: () => Promise<void>,
    root?: string,
  ): Promise<void> {
    return this.inFlight.track(this.runNow(name, session, action, root));
  }

  private async runNow(
    name: string,
    session: Session,
    action: () => Promise<void>,
    root?: string,
  ): Promise<void> {
    try {
      await action();
    } catch (error) {
      const text = gitErrorText(error);
      this.log.error(strings.log.failed(name));
      this.log.error(error instanceof Error ? error : text);
      if (root === undefined || this.isActive(root)) {
        session.post({ type: 'error', message: text });
      }
    }
  }

  private async handle(message: ToHost, session: Session): Promise<void> {
    const { storage } = this;
    switch (message.type) {
      case 'ready':
        session.post(storage.layout);
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
      case 'selectTab':
        if (this.page === session && this.isActiveRepository(message.root)) {
          return;
        }
        await this.openTab(session, message.root);
        return;
      case 'selectWorktree': {
        const repository = storage.activeTab;
        if (
          repository === undefined ||
          !sameRoot(this.repositoryOf(message.root), repository) ||
          (this.page === session && this.isActive(message.root))
        ) {
          return;
        }
        this.save(storage.setWorktree(repository, message.root));
        await this.openTab(session, repository);
        return;
      }
      case 'openRepository':
        await this.openRepositories(session, [message.root], true);
        return;
      case 'browseRepositories':
        await this.openRepositories(session, await this.host.chooseFolders());
        return;
      case 'closeTab': {
        const { tabs, activeTab } = storage;
        const index = tabs.findIndex((tab) => sameRoot(tab, message.root));
        const rest = tabs.filter((tab) => !sameRoot(tab, message.root));
        for (const root of this.tabStates.keys()) {
          if (sameRoot(this.repositoryOf(root), message.root)) {
            this.tabStates.delete(root);
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
        const tabs = storage.tabs.toSorted((a, b) =>
          tabName(a).localeCompare(tabName(b), undefined, {
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
        await storage.setColumnWidths(message.widths);
        return;
      case 'setShowAllFiles':
        await storage.setShowAllFiles(message.show);
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
        await storage.setDiffLayout(message.layout);
        return;
      case 'setWordWrap':
        await storage.setWordWrap(message.wrap);
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
        const context = await this.context(session, message.root);
        this.save(storage.setSolo(message.root, message.solo));
        if (!context) {
          return;
        }
        context.post({ type: 'solo', solo: message.solo });
        context.post({ type: 'applyingSolo', running: true });
        try {
          forgetHistory(context.tab);
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
        await storage.setBookmarks(
          this.repositoryOf(message.root),
          message.bookmarks,
        );
        return;
      case 'scrolled': {
        const tab = this.tabStates.get(message.root);
        if (tab) {
          tab.anchor = { hash: message.hash, offset: message.offset };
        }
        return;
      }
      default:
        if (this.isActive(message.root)) {
          await this.handleTab(message, session);
        }
    }
  }

  private async handleTab(
    message: Exclude<
      TabMessage,
      { type: 'setBookmarks' | 'setSolo' | 'scrolled' }
    >,
    session: Session,
  ): Promise<void> {
    const context = await this.context(session);
    if (!context) {
      return;
    }
    switch (message.type) {
      case 'loadCommits':
        await this.sendCommitPage(context, message.generation, message.start);
        break;
      case 'toggleMerge':
        toggleMerges(context.tab, [message.hash]);
        await this.sendShownHistory(context, { scrollTo: message.hash });
        break;
      case 'checkout':
        await this.checkout(context, message.target);
        break;
      case 'fetch':
        await this.fetch(context);
        break;
      case 'loadTree':
        if (this.isSelected(context, message.hash)) {
          await this.sendTree(context, message.hash);
        }
        break;
      case 'jump': {
        if (isFullHash(message.hash)) {
          await this.showCommit(context, message.hash.toLowerCase());
          break;
        }
        const found = await findCommit(
          context.gitPath,
          context.root,
          message.hash,
        );
        if (found.kind === 'found') {
          await this.showCommit(context, found.hash);
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
        await this.showUpstream(context);
        break;
      case 'showParent': {
        const parent = parentOf(context.tab);
        if (parent !== undefined) {
          await this.showCommit(context, parent);
        }
        break;
      }
      case 'navigate':
        await this.navigate(context, message.direction, message.steps);
        break;
      case 'lookupHash':
        await this.lookupHash(context, message.query);
        break;
      case 'searchCommits':
        await this.searchCommits(context, message.query);
        break;
      case 'selectCommit':
        context.tab.selection = message.selection;
        if (message.hash === undefined) {
          unselect(context.tab);
          break;
        }
        this.visit(context, message.hash, message.replace);
        select(context.tab, message.hash);
        if (hiddenSides(context.tab, message.hash).length > 0) {
          this.notInHistory(context, message.hash);
          break;
        }
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
    const repositories: string[] = [];
    for (const folder of folders) {
      let location: Location | undefined;
      try {
        location = await locateRepository(this.gitPath, folder);
      } catch (error) {
        this.log.error(strings.log.openingFailed(folder));
        this.log.error(error instanceof Error ? error : String(error));
        session.post({
          type: 'notice',
          level: 'error',
          message: strings.messages.couldNotOpen(folder, gitErrorText(error)),
        });
        continue;
      }
      if (!location) {
        this.save(storage.removeRecent(folder));
        session.post({
          type: 'notice',
          level: 'error',
          message: strings.messages.notInRepository(folder),
        });
        continue;
      }
      const repository = await knownFolder(location.repository, storage.tabs);
      const usable = this.takeWorktrees(repository, location.worktrees).filter(
        (worktree) => !worktree.bare && !worktree.missing,
      );
      const saved = storage.worktreeOf(repository);
      const worktree =
        (reopened ? undefined : location.worktree) ??
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
      await this.openTab(session, last);
    } else {
      this.postTabs(session);
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
    this.postTabs(session);
    if (active === undefined) {
      this.stopWatching(session);
      return;
    }
    const worktree = this.storage.worktreeOf(active);
    this.repositories.set(worktree, active);
    await allSettled([
      this.loadWorktrees(session, active),
      this.openWorktree(session, worktree),
    ]);
  }

  private async openWorktree(session: Session, root: string): Promise<void> {
    const tab = this.tabState(root);
    await tab.preloading;
    if (!this.isActive(root)) {
      return;
    }
    for (const message of replayOf(tab)) {
      session.post(message);
    }
    this.page = session;
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
    this.grouped ??= this.groupTabsNow().catch((error: unknown) => {
      this.log.error(strings.log.groupingFailed);
      this.log.error(error);
    });
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
          : await knownFolder(location.repository, [
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
    await storage.setTabs(grouped, active);
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
    const known = [
      repository,
      this.storage.worktreeOf(repository),
      ...(this.worktreeLists.get(repository) ?? []).map(
        (worktree) => worktree.root,
      ),
    ];
    let worktrees: Worktree[];
    try {
      worktrees = await listWorktrees(this.gitPath, repository, known);
    } catch (error) {
      this.log.error(strings.log.listingWorktreesFailed(repository));
      this.log.error(error);
      worktrees = [];
    }
    const shown = JSON.stringify(this.worktreeLists.get(repository));
    this.takeWorktrees(repository, worktrees);
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
      this.refresh(context, () =>
        allSettled([
          (async () => {
            if (!historyLoaded(context.tab)) {
              await this.sendCommits(context, refs);
            }
            await this.sendCommit(context);
          })(),
          this.sendWorkingTree(context),
        ]),
      ),
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
    const { head, refs: listed, stashes } = await refs;
    context.post({
      type: 'repository',
      head: head?.name,
      headCommit: head?.commit,
      refs: listed,
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
  }

  private sendTabs(session: Session): void {
    const { storage } = this;
    const { tabs, activeTab: active, activeWorktree: worktree } = storage;
    session.post({
      type: 'tabs',
      tabs: tabs.map(tabInfo),
      active,
      worktree,
      worktrees: active === undefined ? [] : this.worktreeLists.get(active),
      recent: storage.recent
        .filter(
          (root) =>
            !storage.hasTab(root) && !storage.hasTab(this.repositoryOf(root)),
        )
        .map(tabInfo),
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
    const [{ refs: listed }, defaults] = await Promise.all([
      refs ?? this.refsOf(context),
      remoteDefaultBranches(context.gitPath, context.root),
    ]);
    const bookmarks = defaultBookmarks(listed, defaults);
    await this.storage.setBookmarks(context.repository, bookmarks);
    context.post({ type: 'bookmarks', bookmarks });
  }

  private tabState(root: string): Tab {
    let tab = this.tabStates.get(root);
    if (!tab) {
      tab = {
        ...newTabState(),
        preloading: undefined,
        refreshing: false,
        refreshAgain: new Map(),
        checkRefsAgain: false,
        refreshedAgain: undefined,
        loadsAgain: [],
        refreshError: undefined,
        isRepository: false,
        selection: undefined,
        navigating: Promise.resolve(),
        checkingOut: Promise.resolve(),
        diffRequest: 0,
        diffOwed: false,
        loadingFiles: new AbortController(),
        loadingDiff: new AbortController(),
        untrackedPatches: new Map(),
      };
      this.tabStates.set(root, tab);
    }
    return tab;
  }

  private refsOf(context: Context): Promise<Refs> {
    return readRefs(context.gitPath, context.root);
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
        session.post({
          type: 'error',
          message: strings.messages.notRepository(root),
        });
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
        if (live && this.isActive(root) && this.tabStates.get(root) === tab) {
          (session.disposed ? this.page : session)?.post(message);
        }
      },
    };
  }

  private async watch(context: Context, session: Session): Promise<void> {
    this.stopWatching(session);
    const watcher = await this.startWatching(context, session);
    if (
      session.disposed ||
      session.watcher !== undefined ||
      !this.isActive(context.root) ||
      this.tabStates.get(context.root) !== context.tab
    ) {
      void this.inFlight.track(watcher.dispose());
      return;
    }
    session.watcher = watcher;
  }

  private stopWatching(session: Session): void {
    const { watcher } = session;
    session.watcher = undefined;
    if (watcher) {
      void this.inFlight.track(watcher.dispose());
    }
  }

  private startWatching(context: Context, session: Session): Promise<Watcher> {
    return watchRepository(context.gitPath, context.root, {
      ...this.delays,
      onChange: (gitDirChanged) =>
        void this.run(
          'refresh',
          session,
          () => this.refresh(context, undefined, gitDirChanged),
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
    });
  }

  private checkout(context: Context, target: CheckoutTarget): Promise<void> {
    const { tab } = context;
    const checkingOut = tab.checkingOut.then(() =>
      this.checkoutNow(context, target),
    );
    tab.checkingOut = checkingOut.catch(() => undefined);
    return checkingOut;
  }

  private async checkoutNow(
    context: Context,
    target: CheckoutTarget,
  ): Promise<void> {
    if (!(await checkout(this.log, this.notify(context), context, target))) {
      return;
    }
    await this.refresh(context);
    await this.showHead(context);
  }

  private async fetch(context: Context): Promise<void> {
    context.post({ type: 'fetching', running: true });
    try {
      await this.fetchRemotes(context);
    } finally {
      context.post({ type: 'fetching', running: false });
    }
    await this.refresh(context);
  }

  private async fetchRemotes(
    context: Context,
    log: Log = this.log,
    notify: Notify = this.notify(context),
    interactive = true,
  ): Promise<boolean> {
    const { repository } = context;
    const { fetches } = this;
    const running = fetches.get(repository);
    const joined =
      running !== undefined && (!interactive || running.interactive);
    const fetching = joined ? running : this.startFetch(context, interactive);
    const result = await fetching.fetched;
    const latest = fetches.get(repository);
    if (!interactive && latest?.interactive) {
      return !(await latest.fetched).failed;
    }
    if (joined) {
      return !result.failed;
    }
    const fetched = reportFetched(log, notify, result);
    if (fetched) {
      this.fetchFailures.delete(repository);
    } else {
      this.fetchFailures.add(repository);
    }
    return fetched;
  }

  private startFetch(context: Context, interactive: boolean): Fetching {
    const { repository } = context;
    const { fetches } = this;
    const running = fetches.get(repository)?.fetched;
    const started: Fetching = {
      fetched: (running
        ? running.then(() => fetchAll(context, interactive))
        : fetchAll(context, interactive)
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
    if (!session || !this.storage.hasTab(repository)) {
      return;
    }
    const root = this.storage.worktreeOf(repository);
    this.repositories.set(root, repository);
    const context = await this.context(session, root, this.isActive(root));
    if (!context) {
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
    if (!(await this.fetchRemotes(context, log, notify, false))) {
      return;
    }
    const page = this.page;
    const shown =
      page && this.isActive(root) ? await this.context(page, root) : undefined;
    if (page && shown) {
      await this.run('refresh', page, () => this.refresh(shown), root);
    }
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
      (session.disposed ? this.page : session)?.post({
        type: 'notice',
        level,
        message: strings.messages.inTab(tabName(repository), message),
      });
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

  private async searchCommits(context: Context, query: string): Promise<void> {
    this.commitSearches.get(context.root)?.abort();
    const search = new AbortController();
    this.commitSearches.set(context.root, search);
    try {
      const result = await this.commitsMatching(context, query, search.signal);
      if (!search.signal.aborted) {
        context.post({ type: 'commitSearch', query, result });
      }
    } catch (error) {
      if (!search.signal.aborted) {
        throw error;
      }
    } finally {
      if (this.commitSearches.get(context.root) === search) {
        this.commitSearches.delete(context.root);
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
  ): Promise<void> {
    const { tab } = context;
    const navigating = tab.navigating.then(() =>
      this.navigateNow(context, direction, steps),
    );
    tab.navigating = navigating.catch(() => undefined);
    return navigating;
  }

  private async navigateNow(
    context: Context,
    direction: Direction,
    steps: number,
  ): Promise<void> {
    const { tab } = context;
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
    await this.showCommit(context, result.target, false);
    await this.sendNavigation(context);
  }

  private async showCommit(
    context: Context,
    hash: string,
    record = true,
  ): Promise<void> {
    const { tab } = context;
    const merges = new Set(
      hiddenSides(tab, hash).flatMap((side) => mergesHidingCommit(tab, side)),
    );
    if (merges.size > 0) {
      expandMerges(tab, [...merges], this.storage.collapseMerges);
      await this.sendShownHistory(context, { scrollTo: hash });
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
        selection: tab.selection,
      });
    }
    await this.sendCommit(context);
  }

  private async showUpstream(context: Context): Promise<void> {
    const upstream = await readUpstream(context.gitPath, context.root);
    const notify = this.notify(context);
    switch (upstream.kind) {
      case 'detached':
        notify('info', strings.messages.detachedUpstream);
        return;
      case 'none':
        notify('info', strings.messages.noUpstream(upstream.branch));
        return;
      case 'gone':
        notify(
          'info',
          strings.messages.upstreamGone(upstream.name, upstream.branch),
        );
        return;
      case 'found':
        if (
          this.storage.soloOf(context.root) &&
          !stillThere(context.tab)(upstream.commit)
        ) {
          notify('info', strings.messages.upstreamHidden(upstream.name));
          return;
        }
        await this.showCommit(context, upstream.commit);
    }
  }

  private async showHead(context: Context): Promise<void> {
    const head = await headCommit(context.gitPath, context.root);
    if (head) {
      await this.showCommit(context, head);
    }
  }

  private async refresh(
    context: Context,
    load?: () => Promise<void>,
    checkRefs = true,
  ): Promise<void> {
    const { tab } = context;
    try {
      await this.queueRefresh(context, load, checkRefs);
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
    checkRefs: boolean,
  ): Promise<void> {
    const { tab } = context;
    const run = load ?? (() => this.refreshOnce(context, checkRefs));
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
    tab.checkRefsAgain ||= checkRefs;
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
    const again = toAll([...tab.refreshAgain.values()]);
    const done = tab.refreshedAgain;
    if (!again || !done) {
      return undefined;
    }
    const checkRefs = tab.checkRefsAgain;
    tab.refreshAgain.clear();
    tab.checkRefsAgain = false;
    tab.refreshedAgain = undefined;
    return { run: () => this.refreshOnce(again, checkRefs), done };
  }

  private async refreshOnce(
    context: Context,
    checkRefs: boolean,
  ): Promise<void> {
    await allSettled([
      this.sendWorkingTree(context).then(async (workingTree) => {
        const { hash } = context.tab;
        if (hash !== undefined && workingTreeSide(hash)) {
          await this.sendCommit(context, workingTree);
          if (
            context.tab.shown.tree?.hash === hash &&
            shownCommit(hash) === undefined
          ) {
            await this.sendTree(context, hash, workingTree);
          }
        }
      }),
      checkRefs || context.tab.shownStale
        ? this.refreshHistory(context)
        : Promise.resolve(),
    ]);
  }

  private async refreshHistory(context: Context): Promise<void> {
    const refs = await this.refsOf(context);
    const { tab } = context;
    const { head, refs: listed, stashes } = refs;
    if (fingerprint(head, listed, stashes) === tab.fingerprint) {
      if (tab.shownStale) {
        await this.sendShownHistory(context, { keepPlace: true });
      }
      return;
    }
    const known = Promise.resolve(refs);
    if (
      refsKeepHistory(
        tab,
        head,
        listed,
        this.storage.soloOf(context.root),
        stashes,
      )
    ) {
      this.log.info(strings.log.refsKept);
      const layOut = tab.shownStale || tab.headCommit !== head?.commit;
      takeRefs(tab, head, listed, stashes);
      await Promise.all([
        this.sendRepository(context, known),
        this.sendShownHistory(context, { keepPlace: true, layOut }),
      ]);
      return;
    }
    this.log.info(strings.log.refsReloaded);
    await Promise.all([
      this.sendRepository(context, known),
      this.sendCommits(context, known, true),
    ]);
  }

  private async sendWorkingTree(context: Context): Promise<WorkingTree> {
    const workingTree = await workingTreeFiles(context.gitPath, context.root);
    context.post({ type: 'workingTree', files: uncommittedCount(workingTree) });
    return workingTree;
  }

  private async sendCommits(
    context: Context,
    refs: Promise<Refs>,
    keepPlace = false,
  ): Promise<void> {
    const { head, refs: listed, stashes } = await refs;
    const fullHistory = await listHistory(
      context.gitPath,
      context.root,
      this.storage.soloOf(context.root),
      stashes.map((stash) => stash.commit),
    );
    const { tab } = context;
    loadHistory(tab, fullHistory, head, listed, stashes);
    if (tab.hash !== undefined && !stillThere(tab)(tab.hash)) {
      unselect(tab);
      context.post({ type: 'unselect', selection: tab.selection });
    }
    await this.sendShownHistory(context, { keepPlace });
    const { back, forward } = tab.navigation;
    if (back.length + forward.length > 0) {
      await this.sendNavigation(context);
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
    const commits = await logCommits(
      context.gitPath,
      context.root,
      tab.history
        .slice(page.start, page.start + 2 * commitPageSize)
        .map((entry) => entry.hash),
    ).catch((error: unknown) => {
      if (tab.generation === generation) {
        tab.shownStale = true;
      }
      throw error;
    });
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
    return generation;
  }

  private async sendCommitPage(
    context: Context,
    generation: number,
    start: number,
  ): Promise<void> {
    const { tab } = context;
    const replaced = () => tab.generation !== generation;
    if (replaced()) {
      return;
    }
    const { history, graph } = tab;
    const commits = await logCommits(
      context.gitPath,
      context.root,
      history.slice(start, start + commitPageSize).map((entry) => entry.hash),
    ).catch((error: unknown) => {
      if (!replaced()) {
        context.post({
          type: 'commitPage',
          generation,
          start,
          commits: [],
          graph: [],
        });
      }
      throw error;
    });
    keepSubjects(tab, commits);
    if (replaced()) {
      return;
    }
    context.post({
      type: 'commitPage',
      generation,
      start,
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
          ));
        files = workingTree.files;
        staged = workingTree.staged;
      } else {
        files = await this.commitFiles(context, hash, signal);
      }
    } catch (error) {
      if (signal.aborted) {
        return;
      }
      throw error;
    }
    if (tab.hash !== hash || signal.aborted) {
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
    await this.sendDiff(context, hash, refreshing);
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
    const patch = await this.patchOf(context, hash, {
      path: file,
      oldPath: change?.oldPath,
      ignoreWhitespace: this.storage.ignoreWhitespace,
    });
    if (context.tab.hash === hash && patch !== shownPatch) {
      context.post({ type: 'fileDiff', hash, path: file, patch, diff });
    }
  }

  private async sendTexts(
    context: Context,
    { hash, diff, texts }: Extract<TabMessage, { type: 'loadTexts' }>,
  ): Promise<void> {
    const { gitPath, root } = context;
    const fromDisk = (request: TextRequest) =>
      context.tab.area !== 'staged' && request.side === workingTreeSide(hash);
    const blobs = await readBlobs(
      gitPath,
      root,
      texts.filter((request) => !fromDisk(request)).map(({ blob }) => blob),
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
    const paths = await listTree(
      context.gitPath,
      context.root,
      shownCommit(hash),
      refreshed?.untracked,
    );
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
    const stale = () =>
      tab.diffRequest !== request ||
      tab.hash !== hash ||
      tab.path !== file ||
      tab.area !== area;
    const changes = changesOf(tab);
    const change = file === undefined ? undefined : changes.get(file);
    if (file !== undefined && !change) {
      const { content, binary } = await readFile(
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
        shownDiff.binary === binary;
      if (!stale() && !unchanged) {
        tab.diffOwed = false;
        context.post({
          type: 'fileContent',
          hash,
          path: file,
          ...areaOf(area),
          content,
          binary,
        });
      }
      return;
    }
    const scope =
      file === undefined
        ? {
            include: includedChanges([...changes.values()]),
            ignoreWhitespace: this.storage.ignoreWhitespace,
          }
        : {
            path: file,
            oldPath: change?.oldPath,
            entireFile: context.tab.entireFile || this.storage.entireFilePinned,
            ignoreWhitespace: this.storage.ignoreWhitespace,
          };
    let patch: string;
    try {
      patch = await this.patchOf(context, hash, scope, loading.signal);
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
      shownDiff.patch === patch;
    if (stale()) {
      return;
    }
    if (!unchanged) {
      tab.diffOwed = false;
      context.post({ type: 'diff', hash, path: file, ...areaOf(area), patch });
    } else if (file === undefined) {
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

function workingTreeSide(hash: string): TextRequest['side'] | undefined {
  const { from, to } = comparedOf(hash) ?? { from: undefined, to: hash };
  if (to === workingTreeHash) {
    return 'new';
  }
  return from === workingTreeHash ? 'old' : undefined;
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

function areaOf(area: ChangeArea | undefined): { area?: ChangeArea } {
  return area === undefined ? {} : { area };
}

function shownCommit(hash: string): string | undefined {
  const shown = shownSide(hash);
  return shown === workingTreeHash ? undefined : shown;
}

function includedChanges(files: readonly FileChange[]): string[] | undefined {
  const deferred = deferredChanges(files);
  return deferred.size === 0
    ? undefined
    : files
        .filter((file) => !deferred.has(file.path))
        .flatMap((file) =>
          file.oldPath ? [file.oldPath, file.path] : [file.path],
        );
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

function tabInfo(root: string): TabInfo {
  return { root, name: tabName(root) };
}

export function tabName(root: string): string {
  const name = path.basename(root);
  if (name === '.bare' || name === '.git') {
    return tabName(path.dirname(root));
  }
  return name.replace(/(.)\.git$/, '$1') || root;
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

async function knownFolder(
  folder: string,
  known: readonly string[],
): Promise<string> {
  const same = known.find((spelling) => sameRoot(spelling, folder));
  if (same !== undefined) {
    return same;
  }
  const real = await Promise.all(
    known.map((spelling) => sameFolder(spelling, folder)),
  );
  return known[real.indexOf(true)] ?? folder;
}
