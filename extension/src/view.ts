import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { remoteDefaultBranches } from './git/branches';
import { showFiles, showPatch, type PatchScope } from './git/diff';
import { gitErrorText } from './git/errorText';
import { listTree, readFile } from './git/files';
import type { API, Repository } from './git/git';
import { findCommit, headCommit, listHistory, logCommits } from './git/history';
import { getGitApi, listRefs, pickRepository } from './git/repository';
import {
  workingTreeFiles,
  workingTreePatch,
  type WorkingTree,
} from './git/workingTree';
import { step, visit } from './history/navigation';
import { checkout, fetchAll, type RepositoryAt } from './operations';
import { checkedOutBranch, defaultBookmarks, fingerprint } from './refs';
import { pickRepositories } from './repositoryPicker';
import { isFullHash } from './shared/hashes';
import {
  commitPageSize,
  isLargeChange,
  workingTreeHash,
  workingTreeIndex,
  type CheckoutTarget,
  type Direction,
  type FileChange,
  type RefInfo,
  type TabMessage,
  type ToExtension,
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

export const toggleViewCommand = 'fastforward.toggleView';
export const showViewCommand = 'fastforward.showView';
export const viewType = 'fastforward.view';
export const viewTitle = '⏩ Fastforward';
const viewUri = vscode.Uri.from({ scheme: 'fastforward', path: '/view' });

const modalEditorGroup = -4;
const refreshDelay = 300;

interface Tab extends TabState {
  preloading: Promise<void> | undefined;
  refreshing: Promise<void> | undefined;
  refreshAgain: Map<Session | undefined, Context>;
}

export interface Connection {
  receive(message: ToExtension): Promise<void>;
  refresh(): Promise<void>;
  dispose(): void;
}

interface Session {
  readonly post: (message: ToWebview) => void;
  watcher: vscode.Disposable | undefined;
  disposed: boolean;
}

interface Context extends RepositoryAt {
  readonly tab: Tab;
  readonly session: Session | undefined;
  readonly post: (message: ToWebview) => void;
}

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

export class FastforwardView implements vscode.CustomReadonlyEditorProvider {
  private readonly tabStates = new Map<string, Tab>();
  private readonly storage: Storage;
  private page: Session | undefined;

  constructor(
    private readonly log: vscode.LogOutputChannel,
    private readonly extensionUri: vscode.Uri,
    workspaceState: vscode.Memento,
    globalState: vscode.ExtensionContext['globalState'],
  ) {
    this.storage = new Storage(workspaceState, globalState);
  }

  private get isShown(): boolean {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    return (
      input instanceof vscode.TabInputCustom && input.viewType === viewType
    );
  }

  async toggle(): Promise<void> {
    if (this.isShown) {
      await this.hide();
    } else {
      await this.show();
    }
  }

  async show(): Promise<void> {
    await vscode.commands.executeCommand(
      '_workbench.openWith',
      viewUri,
      viewType,
      [modalEditorGroup, { pinned: true }],
    );
    this.log.info('View shown');
  }

  private async hide(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.closeModalEditor');
    this.log.info('View hidden');
  }

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => {} };
  }

  resolveCustomEditor(
    _document: vscode.CustomDocument,
    panel: vscode.WebviewPanel,
  ): void {
    const dist = vscode.Uri.joinPath(this.extensionUri, 'dist');
    panel.title = viewTitle;
    panel.webview.options = { enableScripts: true, localResourceRoots: [dist] };
    panel.webview.html = html(panel.webview, dist);
    const connection = this.connect(
      (message) => void panel.webview.postMessage(message),
    );
    panel.webview.onDidReceiveMessage(
      (message: ToExtension) => void connection.receive(message),
    );
    panel.onDidDispose(() => connection.dispose());
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
          const context = await this.context(await getGitApi(), session);
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

  private async handle(message: ToExtension, session: Session): Promise<void> {
    const { storage } = this;
    const git = await getGitApi();
    switch (message.type) {
      case 'ready':
        session.post(storage.layout);
        await this.addWorkspaceTab(git);
        await this.openTab(git, session, storage.activeTab);
        return;
      case 'selectTab':
        await this.openTab(git, session, message.root);
        return;
      case 'addTab': {
        const roots = await pickRepositories(git, storage);
        for (const root of roots) {
          await storage.addRecent(root);
        }
        const added = roots.filter((root) => !storage.hasTab(root));
        await storage.setTabs([...storage.tabs, ...added], storage.activeTab);
        const last = roots.at(-1);
        if (last) {
          await this.openTab(git, session, last);
        }
        return;
      }
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
        await this.openTab(git, session, active);
        return;
      }
      case 'preloadTab':
        await this.preloadTab(git, session, message.root);
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
      case 'setFilesMode':
        await storage.setFilesMode(message.mode);
        return;
      case 'setChangesView':
        await storage.setChangesView(message.view);
        return;
      case 'setCollapseMerges': {
        await storage.setCollapseMerges(message.collapse);
        for (const tab of this.tabStates.values()) {
          tab.toggledMerges.clear();
          tab.shownStale = true;
        }
        const context = await this.context(git, session);
        if (context) {
          await this.sendShownHistory(context);
        }
        return;
      }
      case 'setSolo': {
        await storage.setSolo(message.solo);
        for (const tab of this.tabStates.values()) {
          forgetHistory(tab);
        }
        const context = await this.context(git, session);
        if (context) {
          await this.refresh(context, (latest) =>
            this.sendCommits(latest, listRefs(latest.repository), true),
          );
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
          await this.handleTab(message, git, session);
        }
    }
  }

  private async handleTab(
    message: Exclude<TabMessage, { type: 'setBookmarks' | 'scrolled' }>,
    git: API,
    session: Session,
  ): Promise<void> {
    const context = await this.context(git, session);
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
          context.tab.path = message.path;
          await this.sendDiff(context, message.hash);
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

  private async addWorkspaceTab(git: API): Promise<void> {
    const root = pickRepository(git)?.rootUri.fsPath;
    if (root && !this.storage.hasTab(root)) {
      await this.storage.setTabs(
        [root, ...this.storage.tabs],
        this.storage.activeTab ?? root,
      );
    }
  }

  private async openTab(
    git: API,
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
    const context = await this.context(git, session);
    if (!context || session.disposed || !this.isActive(context.root)) {
      return;
    }
    this.log.info(
      `Tab ${context.root} uses the repository at ${context.repository.rootUri.fsPath}, HEAD ${checkedOutBranch(context.repository.state.HEAD) ?? '(detached)'} ${context.repository.state.HEAD?.commit ?? ''}`,
    );
    this.watch(context, session);
    await this.storage.addRecent(context.root);
    const firstOpen = !context.tab.opened;
    context.tab.opened = true;
    if (!firstOpen && context.tab.shown.commits) {
      this.log.info(`Tab ${context.root} is shown as it was left`);
      await this.addDefaultBookmarks(context);
      await this.refresh(context);
      return;
    }
    await this.loadTab(context, firstOpen);
  }

  private async loadTab(context: Context, atHead: boolean): Promise<void> {
    const refs = listRefs(context.repository);
    await allSettled([
      this.addDefaultBookmarks(context, refs),
      this.refresh(context, async (latest) => {
        if (!historyLoaded(latest.tab)) {
          await this.sendCommits(latest, refs);
        }
        await (atHead ? this.showHead(latest) : this.sendCommit(latest));
      }),
      this.sendWorkingTree(context),
      this.sendRepository(context, refs),
    ]);
  }

  private async preloadTab(
    git: API,
    session: Session,
    root: string,
  ): Promise<void> {
    if (!this.storage.hasTab(root) || this.isActive(root)) {
      return;
    }
    const tab = this.tabState(root);
    if (tab.opened || tab.preloading) {
      return;
    }
    tab.preloading = (async () => {
      try {
        const context = await this.context(git, session, root, false);
        if (!context || tab.opened) {
          return;
        }
        this.log.info(`Preloading tab ${root}`);
        tab.opened = true;
        await this.loadTab(context, true);
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
    refs: Promise<readonly RefInfo[]>,
  ): Promise<void> {
    const listed = await refs;
    const { HEAD } = context.repository.state;
    context.post({
      type: 'repository',
      head: checkedOutBranch(HEAD),
      headCommit: HEAD?.commit,
      headUpstream: upstreamOf(context.repository),
      refs: listed,
    });
  }

  private postTabs(session: Session): void {
    const { tabs, activeTab: active } = this.storage;
    session.post({
      type: 'tabs',
      tabs: tabs.map((tab) => ({ root: tab, name: path.basename(tab) })),
      active,
    });
    session.post({
      type: 'bookmarks',
      bookmarks: active ? (this.storage.bookmarksOf(active) ?? []) : [],
    });
  }

  private async addDefaultBookmarks(
    context: Context,
    refs?: Promise<readonly RefInfo[]>,
  ): Promise<void> {
    if (this.storage.bookmarksOf(context.root) !== undefined) {
      return;
    }
    const [listed, defaults] = await Promise.all([
      refs ?? listRefs(context.repository),
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
      };
      this.tabStates.set(root, tab);
    }
    return tab;
  }

  private async context(
    git: API,
    session: Session,
    root = this.storage.activeTab,
    live = true,
  ): Promise<Context | undefined> {
    if (!root) {
      return undefined;
    }
    const uri = vscode.Uri.file(root);
    const repository =
      git.repositories.find((candidate) =>
        sameRoot(candidate.rootUri.fsPath, root),
      ) ??
      (await git.openRepository(uri)) ??
      git.getRepository(uri);
    if (!repository) {
      if (live && this.isActive(root)) {
        session.post({
          type: 'error',
          message: `${root} is not a git repository`,
        });
      }
      return undefined;
    }
    if (!repository.state.HEAD) {
      await repository.status();
    }
    const tab = this.tabState(root);
    return {
      gitPath: git.git.path,
      repository,
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

  private watch(context: Context, session: Session): void {
    session.watcher?.dispose();
    let timer: NodeJS.Timeout | undefined;
    const subscription = context.repository.state.onDidChange(() => {
      clearTimeout(timer);
      timer = setTimeout(
        () =>
          void this.run(
            'refresh',
            session,
            () => this.refresh(context),
            context.root,
          ),
        refreshDelay,
      );
    });
    session.watcher = {
      dispose: () => {
        clearTimeout(timer);
        subscription.dispose();
      },
    };
  }

  private async checkout(
    context: Context,
    target: CheckoutTarget,
  ): Promise<void> {
    if (!(await checkout(this.log, context, target))) {
      return;
    }
    await context.repository.status();
    await this.refresh(context);
    await this.showHead(context);
  }

  private async fetch(context: Context): Promise<void> {
    context.post({ type: 'fetching', running: true });
    try {
      await fetchAll(this.log, context.repository);
    } finally {
      context.post({ type: 'fetching', running: false });
    }
    await context.repository.status();
    await this.refresh(context);
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

  private async lookupHash(context: Context, query: string): Promise<void> {
    const result = await findCommit(context.gitPath, context.root, query);
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
    const refs = await listRefs(context.repository);
    if (
      fingerprint(context.repository.state.HEAD, refs) !==
      context.tab.fingerprint
    ) {
      this.log.info('Refs changed, reloading the history');
      const known = Promise.resolve(refs);
      await Promise.all([
        this.sendRepository(context, known),
        this.sendCommits(context, known, true),
      ]);
    } else {
      if (
        context.tab.shown.repository?.headUpstream !==
        upstreamOf(context.repository)
      ) {
        await this.sendRepository(context, Promise.resolve(refs));
      }
      if (context.tab.shownStale) {
        await this.sendShownHistory(context, { keepPlace: true });
      }
    }
  }

  private async sendWorkingTree(context: Context): Promise<WorkingTree> {
    const workingTree = await workingTreeFiles(context.gitPath, context.root);
    context.post({ type: 'workingTree', files: workingTree.files.length });
    return workingTree;
  }

  private async sendCommits(
    context: Context,
    refs: Promise<readonly RefInfo[]>,
    keepPlace = false,
  ): Promise<void> {
    const [fullHistory, listed] = await Promise.all([
      listHistory(context.gitPath, context.root, this.storage.solo),
      refs,
    ]);
    const { tab } = context;
    loadHistory(tab, fullHistory, context.repository.state.HEAD, listed);
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
      context.repository.state.HEAD?.commit,
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
    });
    if (context.tab.hash === hash) {
      context.post({ type: 'fileDiff', hash, path: file, patch, diff });
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
          }
        : { path: file, oldPath: change?.oldPath };
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

function upstreamOf(repository: Repository): string | undefined {
  const upstream = repository.state.HEAD?.upstream;
  return upstream && `${upstream.remote}/${upstream.name}`;
}

function html(webview: vscode.Webview, dist: vscode.Uri): string {
  const nonce = randomBytes(16).toString('base64');
  const script = webview.asWebviewUri(vscode.Uri.joinPath(dist, 'webview.js'));
  const style = webview.asWebviewUri(vscode.Uri.joinPath(dist, 'webview.css'));
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fastforward</title>
  <link rel="stylesheet" href="${style.toString()}">
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${script.toString()}"></script>
</body>
</html>`;
}
