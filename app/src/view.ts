import * as path from 'node:path';
import { AutoFetch, type Timer } from './autoFetch';
import { remoteDefaultBranches } from './git/branches';
import { showFiles, showPatch, type PatchScope } from './git/diff';
import { gitErrorText } from './git/errorText';
import { listTree, readBlobs, readFile } from './git/files';
import {
  findCommit,
  findCommits,
  headCommit,
  listHistory,
  logCommits,
  searchCommits,
} from './git/history';
import {
  readHead,
  readRefs,
  repositoryRoot,
  type Refs,
} from './git/repository';
import { watchRepository, type Watcher } from './git/watch';
import {
  workingTreeFiles,
  workingTreePatch,
  type WorkingTree,
} from './git/workingTree';
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
import { isFullHash } from './shared/hashes';
import {
  commitPageSize,
  isLargeChange,
  workingTreeHash,
  workingTreeIndex,
  type CheckoutTarget,
  type Direction,
  type FileChange,
  type TabInfo,
  type TabMessage,
  type TextRequest,
  type ToHost,
  type ToWebview,
} from './shared/protocol';
import { sameRoot, Storage } from './storage';
import {
  commitsMessage,
  expandMerges,
  firstPage,
  forgetHistory,
  historyLoaded,
  keep,
  keepSubjects,
  layOutHistory,
  loadHistory,
  mergesHidingCommit,
  navigationEntry,
  nearestSteps,
  newTabState,
  replayOf,
  select,
  stillThere,
  type TabState,
} from './tabState';

const refreshDelay = 300;

interface Tab extends TabState {
  preloading: Promise<void> | undefined;
  refreshing: Promise<void> | undefined;
  refreshAgain: Map<Session | undefined, Context>;
  isRepository: boolean;
  fetching: Promise<Fetched> | undefined;
  fetchFailed: boolean;
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

interface Context extends RepositoryAt {
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
  private readonly commitSearches = new Map<string, AbortController>();
  private page: Session | undefined;
  private readonly autoFetch: AutoFetch;

  constructor(
    private readonly log: Log,
    private readonly gitPath: string,
    private readonly storage: Storage,
    private readonly host: Host,
    timer?: Timer,
  ) {
    this.autoFetch = new AutoFetch(
      () => storage.autoFetchMinutes,
      () => {
        const { tabs, activeTab } = storage;
        const active = tabs.filter(
          (tab) => activeTab !== undefined && sameRoot(tab, activeTab),
        );
        return [...active, ...tabs.filter((tab) => !active.includes(tab))];
      },
      (root) => this.fetchInBackground(root),
      timer,
    );
    this.autoFetch.update();
  }

  reloadSettings(): void {
    this.autoFetch.update();
    for (const tab of this.tabStates.values()) {
      forgetHistory(tab);
      tab.opened = false;
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
          'root' in message && message.type !== 'closeTab'
            ? message.root
            : undefined,
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
        session.watcher?.dispose();
        session.watcher = undefined;
      },
    };
  }

  private isActive(root: string): boolean {
    const active = this.storage.activeTab;
    return active !== undefined && sameRoot(active, root);
  }

  private async run(
    name: string,
    session: Session,
    action: () => Promise<void>,
    root?: string,
  ): Promise<void> {
    try {
      await action();
    } catch (error) {
      const text = gitErrorText(error);
      this.log.error(`${name} failed`);
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
            message: `Settings: ${problem}`,
          });
        }
        await this.openTab(session, storage.activeTab);
        return;
      case 'openSettings':
        await this.host.openSettings();
        return;
      case 'openDefaultSettings':
        await this.host.openDefaultSettings();
        return;
      case 'selectTab':
        await this.openTab(session, message.root);
        return;
      case 'openRepository':
        await this.openRepositories(session, [message.root]);
        return;
      case 'browseRepositories':
        await this.openRepositories(session, await this.host.chooseFolders());
        return;
      case 'closeTab': {
        const { tabs, activeTab } = storage;
        const index = tabs.findIndex((tab) => sameRoot(tab, message.root));
        const rest = tabs.filter((tab) => !sameRoot(tab, message.root));
        this.tabStates.delete(message.root);
        const active =
          activeTab !== undefined && sameRoot(activeTab, message.root)
            ? rest[Math.min(index, rest.length - 1)]
            : activeTab;
        await storage.setTabs(rest, active);
        await this.openTab(session, active);
        return;
      }
      case 'preloadTab':
        await this.preloadTab(session, message.root);
        return;
      case 'sortTabs': {
        const tabs = storage.tabs.toSorted((a, b) =>
          path.basename(a).localeCompare(path.basename(b), undefined, {
            sensitivity: 'base',
          }),
        );
        await storage.setTabs(tabs, storage.activeTab);
        this.postTabs(session);
        return;
      }
      case 'log':
        this.log[message.level](`Webview: ${message.message}`);
        return;
      case 'setColumnWidths':
        await storage.setColumnWidths(message.widths);
        return;
      case 'setShowAllFiles':
        await storage.setShowAllFiles(message.show);
        return;
      case 'setCollapseMerges': {
        await storage.setCollapseMerges(message.collapse);
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
        await storage.setEntireFilePinned(message.pinned);
        const context = await this.context(session);
        if (context?.tab.hash !== undefined && context.tab.path !== undefined) {
          await this.sendDiff(context, context.tab.hash);
        }
        return;
      }
      case 'setAutoFetch':
        await storage.setAutoFetch(message.on);
        this.autoFetch.update(message.on);
        return;
      case 'setDiffLayout':
        await storage.setDiffLayout(message.layout);
        return;
      case 'setIgnoreWhitespace': {
        await storage.setIgnoreWhitespace(message.ignore);
        const context = await this.context(session);
        if (context?.tab.hash !== undefined) {
          await this.sendDiff(context, context.tab.hash);
        }
        return;
      }
      case 'setSolo': {
        const context = await this.context(session, message.root);
        await storage.setSolo(message.root, message.solo);
        if (!context) {
          return;
        }
        context.post({ type: 'solo', solo: message.solo });
        context.post({ type: 'applyingSolo', running: true });
        try {
          forgetHistory(context.tab);
          if (this.isActive(message.root)) {
            await this.refresh(context, (latest) =>
              this.sendCommits(latest, this.refsOf(latest), true),
            );
          }
        } finally {
          context.post({ type: 'applyingSolo', running: false });
        }
        return;
      }
      case 'setBookmarks':
        await storage.setBookmarks(message.root, message.bookmarks);
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
      case 'toggleMerge': {
        const toggled = context.tab.toggledMerges;
        if (!toggled.delete(message.hash)) {
          toggled.add(message.hash);
        }
        await this.sendShownHistory(context, { scrollTo: message.hash });
        break;
      }
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
          context.post({
            type: 'error',
            message:
              found.kind === 'ambiguous'
                ? `${found.count} commits start with ${message.hash}`
                : `No commit ${message.hash}`,
          });
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
        if (message.hash) {
          this.visit(context, message.hash, message.replace);
        }
        select(context.tab, message.hash);
        if (!message.hash) {
          context.tab.shown.files = undefined;
          context.tab.shown.diff = undefined;
        }
        await this.sendCommit(context);
        break;
      case 'selectFile':
        if (this.isSelected(context, message.hash)) {
          if (context.tab.path !== message.path) {
            context.tab.entireFile = false;
          }
          context.tab.path = message.path;
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
    context.post({ type: 'error', message: `${hash} is not in the history` });
  }

  private async openRepositories(
    session: Session,
    folders: readonly string[],
  ): Promise<void> {
    const { storage } = this;
    const roots: string[] = [];
    for (const folder of folders) {
      const root = await repositoryRoot(this.gitPath, folder);
      if (root) {
        roots.push(root);
        await storage.addRecent(root);
      } else {
        await storage.removeRecent(folder);
        session.post({
          type: 'notice',
          level: 'error',
          message: `${folder} is not in a git repository`,
        });
      }
    }
    const added = roots.filter(
      (root, index) =>
        !storage.hasTab(root) &&
        roots.findIndex((other) => sameRoot(other, root)) === index,
    );
    await storage.setTabs([...storage.tabs, ...added], storage.activeTab);
    const last = roots.at(-1);
    if (last) {
      await this.openTab(session, last);
    } else {
      this.postTabs(session);
    }
  }

  private async openTab(
    session: Session,
    root: string | undefined,
  ): Promise<void> {
    const { tabs } = this.storage;
    const active = (root && tabs.find((tab) => sameRoot(tab, root))) ?? tabs[0];
    await this.storage.setTabs(tabs, active);
    this.postTabs(session);
    if (active) {
      const tab = this.tabState(active);
      await tab.preloading;
      if (!this.isActive(active)) {
        return;
      }
      for (const message of replayOf(tab)) {
        session.post(message);
      }
      this.page = session;
    }
    session.watcher?.dispose();
    session.watcher = undefined;
    const context = await this.context(session);
    if (!context || session.disposed || !this.isActive(context.root)) {
      return;
    }
    const head = await readHead(context.gitPath, context.root);
    this.log.info(
      `Tab ${context.root} is open, HEAD ${head?.name ?? '(detached)'} ${head?.commit ?? ''}`,
    );
    await this.watch(context, session);
    await this.storage.addRecent(context.root);
    if (context.tab.entireFile) {
      context.tab.entireFile = false;
      const { hash, path: file } = context.tab;
      if (hash !== undefined && file !== undefined) {
        await this.sendDiff(context, hash);
      }
    }
    const firstOpen = !context.tab.opened;
    context.tab.opened = true;
    if (!firstOpen && context.tab.shown.commits) {
      this.log.info(`Tab ${context.root} is shown as it was left`);
      await this.addDefaultBookmarks(context);
      await this.refresh(context);
      return;
    }
    await this.loadTab(context);
  }

  private async loadTab(context: Context): Promise<void> {
    const refs = this.refsOf(context);
    await allSettled([
      this.addDefaultBookmarks(context, refs),
      this.refresh(context, async (latest) => {
        if (!historyLoaded(latest.tab)) {
          await this.sendCommits(latest, refs);
        }
        await this.sendCommit(latest);
      }),
      this.sendWorkingTree(context),
      this.sendRepository(context, refs),
    ]);
  }

  private async preloadTab(session: Session, root: string): Promise<void> {
    if (!this.storage.hasTab(root) || this.isActive(root)) {
      return;
    }
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
        this.log.info(`Preloading tab ${root}`);
        tab.opened = true;
        await this.loadTab(context);
      } catch (error) {
        Object.assign(tab, newTabState());
        this.log.error(`Preloading tab ${root} failed`);
        this.log.error(error instanceof Error ? error : String(error));
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
    const { head, refs: listed } = await refs;
    context.post({
      type: 'repository',
      head: head?.name,
      headCommit: head?.commit,
      refs: listed,
    });
  }

  private postTabs(session: Session): void {
    const { tabs, activeTab: active, recent } = this.storage;
    session.post({
      type: 'tabs',
      tabs: tabs.map(tabInfo),
      active,
      recent: recent.filter((root) => !this.storage.hasTab(root)).map(tabInfo),
    });
    session.post({
      type: 'bookmarks',
      bookmarks: active ? (this.storage.bookmarksOf(active) ?? []) : [],
    });
    session.post({
      type: 'solo',
      solo: active !== undefined && this.storage.soloOf(active),
    });
  }

  private async addDefaultBookmarks(
    context: Context,
    refs?: Promise<Refs>,
  ): Promise<void> {
    if (this.storage.bookmarksOf(context.root) !== undefined) {
      return;
    }
    const [{ refs: listed }, defaults] = await Promise.all([
      refs ?? this.refsOf(context),
      remoteDefaultBranches(context.gitPath, context.root),
    ]);
    const bookmarks = defaultBookmarks(listed, defaults);
    await this.storage.setBookmarks(context.root, bookmarks);
    context.post({ type: 'bookmarks', bookmarks });
  }

  private tabState(root: string): Tab {
    let tab = this.tabStates.get(root);
    if (!tab) {
      tab = {
        ...newTabState(),
        preloading: undefined,
        refreshing: undefined,
        refreshAgain: new Map(),
        isRepository: false,
        fetching: undefined,
        fetchFailed: false,
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
    root = this.storage.activeTab,
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
          message: `${root} is not a git repository`,
        });
      }
      return undefined;
    }
    return {
      gitPath: this.gitPath,
      root,
      tab,
      session: live ? session : undefined,
      post: (message) => {
        keep(tab.shown, message);
        if (live && this.isActive(root)) {
          (session.disposed ? this.page : session)?.post(message);
        }
      },
    };
  }

  private async watch(context: Context, session: Session): Promise<void> {
    session.watcher?.dispose();
    session.watcher = undefined;
    const watcher = await watchRepository(context.gitPath, context.root, {
      delay: refreshDelay,
      onChange: () =>
        void this.run(
          'refresh',
          session,
          () => this.refresh(context),
          context.root,
        ),
      onError: (error) => {
        this.log.error(`Watching ${context.root} failed`);
        this.log.error(error instanceof Error ? error : String(error));
      },
    });
    if (
      session.disposed ||
      session.watcher !== undefined ||
      !this.isActive(context.root)
    ) {
      watcher.dispose();
      return;
    }
    session.watcher = watcher;
  }

  private async checkout(
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
  ): Promise<boolean> {
    const { tab } = context;
    tab.fetching ??= fetchAll(context).finally(() => {
      tab.fetching = undefined;
    });
    const fetched = reportFetched(log, notify, await tab.fetching);
    tab.fetchFailed = !fetched;
    return fetched;
  }

  private async fetchInBackground(root: string): Promise<void> {
    const session = this.page;
    if (!session || !this.storage.hasTab(root)) {
      return;
    }
    const context = await this.context(session, root, this.isActive(root));
    if (!context) {
      return;
    }
    const reported = !context.tab.fetchFailed;
    const log: Log = {
      info: silent,
      warn: reported ? (message) => this.log.warn(message) : silent,
      error: reported ? (error) => this.log.error(error) : silent,
    };
    const notify: Notify = reported
      ? (level, message) =>
          this.storage.hasTab(root) &&
          (session.disposed ? this.page : session)?.post({
            type: 'notice',
            level,
            message: `${path.basename(root)}: ${message}`,
          })
      : silent;
    if (!(await this.fetchRemotes(context, log, notify))) {
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
    return (level, message) => context.post({ type: 'notice', level, message });
  }

  private visit(context: Context, hash: string, replace = false): void {
    const { tab } = context;
    const next = visit(tab.navigation, tab.hash, hash, replace);
    if (next !== tab.navigation) {
      tab.navigation = next;
      void this.sendNavigation(context, hash).catch((error: unknown) =>
        this.log.error(error instanceof Error ? error : String(error)),
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
      (hash) => hash !== workingTreeHash && !tab.subjects.has(hash),
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
      const result = await searchCommits(
        context.gitPath,
        context.root,
        query,
        this.storage.soloOf(context.root),
        search.signal,
      );
      context.post({ type: 'commitSearch', query, result });
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

  private async lookupHash(context: Context, query: string): Promise<void> {
    const result = await findCommits(context.gitPath, context.root, query);
    context.post({ type: 'hashLookup', query, result });
  }

  private async navigate(
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
    if (result.target === workingTreeHash) {
      select(tab, workingTreeHash);
      context.post({
        type: 'reveal',
        hash: workingTreeHash,
        index: workingTreeIndex,
      });
      await this.sendCommit(context);
    } else {
      await this.showCommit(context, result.target, false);
    }
    await this.sendNavigation(context);
  }

  private async showCommit(
    context: Context,
    hash: string,
    record = true,
  ): Promise<void> {
    const { tab } = context;
    if (!tab.positions.has(hash)) {
      const merges = mergesHidingCommit(tab, hash);
      if (merges.length > 0) {
        expandMerges(tab, merges, this.storage.collapseMerges);
        await this.sendShownHistory(context, { scrollTo: hash });
      }
    }
    const index = tab.positions.get(hash);
    if (index === undefined) {
      this.notInHistory(context, hash);
      return;
    }
    if (record) {
      this.visit(context, hash);
    }
    select(tab, hash);
    context.post({ type: 'reveal', hash, index });
    await this.sendCommit(context);
  }

  private async showHead(context: Context): Promise<void> {
    const head = await headCommit(context.gitPath, context.root);
    if (head) {
      await this.showCommit(context, head);
    }
  }

  private refresh(
    context: Context,
    load?: (context: Context) => Promise<void>,
  ): Promise<void> {
    const { tab } = context;
    if (tab.refreshing) {
      if (!load) {
        tab.refreshAgain.set(context.session, context);
        return tab.refreshing;
      }
      return tab.refreshing
        .catch(() => undefined)
        .then(() => this.refresh(context, load));
    }
    tab.refreshing = (async () => {
      let failure: { error: unknown } | undefined;
      const attempt = async (run: () => Promise<void>) => {
        try {
          await run();
        } catch (error) {
          failure ??= { error };
        }
      };
      try {
        await attempt(() => (load ? load(context) : this.refreshOnce(context)));
        for (;;) {
          const again = toAll([...tab.refreshAgain.values()]);
          if (!again) {
            break;
          }
          tab.refreshAgain.clear();
          await attempt(() => this.refreshOnce(again));
        }
      } finally {
        tab.refreshing = undefined;
        tab.refreshAgain.clear();
      }
      if (failure) {
        throw failure.error;
      }
    })();
    return tab.refreshing;
  }

  private async refreshOnce(context: Context): Promise<void> {
    await Promise.all([
      this.sendWorkingTree(context).then(async (workingTree) => {
        if (context.tab.hash === workingTreeHash) {
          await this.sendCommit(context, workingTree);
          if (context.tab.shown.tree?.hash === workingTreeHash) {
            await this.sendTree(context, workingTreeHash, true);
          }
        }
      }),
      this.refreshHistory(context),
    ]);
  }

  private async refreshHistory(context: Context): Promise<void> {
    const refs = await this.refsOf(context);
    if (fingerprint(refs.head, refs.refs) !== context.tab.fingerprint) {
      this.log.info('Refs changed, reloading the history');
      const known = Promise.resolve(refs);
      await Promise.all([
        this.sendRepository(context, known),
        this.sendCommits(context, known, true),
      ]);
    } else if (context.tab.shownStale) {
      await this.sendShownHistory(context, { keepPlace: true });
    }
  }

  private async sendWorkingTree(context: Context): Promise<WorkingTree> {
    const workingTree = await workingTreeFiles(context.gitPath, context.root);
    context.post({ type: 'workingTree', files: workingTree.files.length });
    return workingTree;
  }

  private async sendCommits(
    context: Context,
    refs: Promise<Refs>,
    keepPlace = false,
  ): Promise<void> {
    const [fullHistory, { head, refs: listed }] = await Promise.all([
      listHistory(
        context.gitPath,
        context.root,
        this.storage.soloOf(context.root),
      ),
      refs,
    ]);
    const { tab } = context;
    loadHistory(tab, fullHistory, head, listed);
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
    }: { scrollTo?: string; keepPlace?: boolean } = {},
  ): Promise<void> {
    const { tab } = context;
    const started = performance.now();
    const generation = layOutHistory(
      tab,
      this.storage.collapseMerges,
      tab.headCommit,
    );
    this.log.info(
      `Graph of ${tab.history.length} of ${tab.fullHistory.length} commits laid out in ${Math.round(performance.now() - started)} ms, ${tab.graph.width} lanes wide`,
    );
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
    const { hash } = context.tab;
    if (!hash) {
      return;
    }
    let files: readonly FileChange[];
    let workingTree: WorkingTree | undefined;
    if (hash === workingTreeHash) {
      workingTree =
        knownWorkingTree ??
        (await workingTreeFiles(context.gitPath, context.root));
      files = workingTree.files;
    } else if (context.tab.positions.has(hash)) {
      files = await showFiles(context.gitPath, context.root, hash);
    } else {
      this.notInHistory(context, hash);
      return;
    }
    if (context.tab.hash !== hash) {
      return;
    }
    context.tab.changedFiles = new Map(files.map((file) => [file.path, file]));
    if (workingTree) {
      context.tab.workingTree = workingTree;
    }
    const refreshing = knownWorkingTree !== undefined;
    const shownFiles = context.tab.shown.files;
    const unchanged =
      shownFiles?.hash === hash &&
      JSON.stringify(shownFiles.files) === JSON.stringify(files);
    if (!(refreshing && unchanged)) {
      context.post({ type: 'files', hash, files });
    }
    await this.sendDiff(context, hash, refreshing);
  }

  private async sendFileDiff(
    context: Context,
    hash: string,
    file: string,
    diff: number,
  ): Promise<void> {
    const change = context.tab.changedFiles.get(file);
    const patch = await this.patchOf(context, hash, {
      path: file,
      oldPath: change?.oldPath,
      ignoreWhitespace: this.storage.ignoreWhitespace,
    });
    if (context.tab.hash === hash) {
      context.post({ type: 'fileDiff', hash, path: file, patch, diff });
    }
  }

  private async sendTexts(
    context: Context,
    { hash, diff, texts }: Extract<TabMessage, { type: 'loadTexts' }>,
  ): Promise<void> {
    const { gitPath, root } = context;
    const fromDisk = (request: TextRequest) =>
      hash === workingTreeHash && request.side === 'new';
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
        const file = await readFile(gitPath, root, undefined, request.path);
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
  ): Promise<string> {
    const { gitPath, root } = context;
    if (hash !== workingTreeHash) {
      return showPatch(gitPath, root, hash, scope);
    }
    const workingTree =
      context.tab.workingTree ?? (await workingTreeFiles(gitPath, root));
    return workingTreePatch(gitPath, root, workingTree, scope);
  }

  private async sendTree(
    context: Context,
    hash: string,
    refreshing = false,
  ): Promise<void> {
    const paths = await listTree(
      context.gitPath,
      context.root,
      hash === workingTreeHash ? undefined : hash,
    );
    if (context.tab.hash !== hash) {
      return;
    }
    const shown = context.tab.shown.tree;
    const unchanged =
      refreshing &&
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
    const { path: file } = context.tab;
    const stale = () => context.tab.hash !== hash || context.tab.path !== file;
    const change =
      file === undefined ? undefined : context.tab.changedFiles.get(file);
    if (file !== undefined && !change) {
      const { content, binary } = await readFile(
        context.gitPath,
        context.root,
        hash === workingTreeHash ? undefined : hash,
        file,
      );
      const shownDiff = context.tab.shown.diff;
      const unchanged =
        refreshing &&
        shownDiff?.type === 'fileContent' &&
        shownDiff.hash === hash &&
        shownDiff.path === file &&
        shownDiff.content === content &&
        shownDiff.binary === binary;
      if (!stale() && !unchanged) {
        context.post({
          type: 'fileContent',
          hash,
          path: file,
          content,
          binary,
        });
      }
      return;
    }
    const scope =
      file === undefined
        ? {
            exclude: [...context.tab.changedFiles.values()]
              .filter(isLargeChange)
              .flatMap((large) =>
                large.oldPath ? [large.oldPath, large.path] : [large.path],
              ),
            ignoreWhitespace: this.storage.ignoreWhitespace,
          }
        : {
            path: file,
            oldPath: change?.oldPath,
            entireFile: context.tab.entireFile || this.storage.entireFilePinned,
            ignoreWhitespace: this.storage.ignoreWhitespace,
          };
    const patch = await this.patchOf(context, hash, scope);
    const shownDiff = context.tab.shown.diff;
    const unchanged =
      refreshing &&
      shownDiff?.type === 'diff' &&
      shownDiff.hash === hash &&
      shownDiff.path === file &&
      shownDiff.patch === patch;
    if (!stale() && !unchanged) {
      context.post({ type: 'diff', hash, path: file, patch });
    }
  }
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
  return { root, name: path.basename(root) };
}
