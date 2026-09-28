import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { remoteDefaultBranches } from './git/branches';
import { showFiles, showPatch, type PatchScope } from './git/diff';
import { listTree, readFile } from './git/files';
import type { API, Repository } from './git/git';
import {
  commitOf,
  findCommit,
  headCommit,
  listHistory,
  logCommits,
} from './git/history';
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
import {
  commitPageSize,
  isLargeChange,
  workingTreeHash,
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
  keep,
  keepSubjects,
  layOutHistory,
  loadHistory,
  mergesHidingCommit,
  navigationEntry,
  nearestSteps,
  newTabState,
  positionOf,
  replayOf,
  select,
  stillThere,
  type TabState,
} from './tabState';

export const toggleViewCommand = 'fastforward.toggleView';
export const showViewCommand = 'fastforward.showView';
export const viewType = 'fastforward.view';
export const viewTitle = '⏩ Fastforward';
// resourceLabelFormatters in package.json blanks the label of this URI, so the
// modal doesn't show its path next to the title
const viewUri = vscode.Uri.from({ scheme: 'fastforward', path: '/view' });

// The view is a custom editor, because _workbench.openWith is the only way for
// an extension to open an editor in the modal editor part (group -4)
const modalEditorGroup = -4;

// A tab's state, and the loads and refreshes running for it
interface Tab extends TabState {
  // Loading in the background, before the tab is opened
  preloading: Promise<void> | undefined;
  // The load or refresh that is running, and whether another change came in
  // during it, which runs a refresh once more instead of in parallel, with
  // the context of the last one asked for, whose page may be a newer one
  refreshing: Promise<void> | undefined;
  refreshAgain: boolean;
  refreshContext: Context | undefined;
}

// One page's link to the view: its messages go in, answers go to its post
export interface Connection {
  // Resolves once the message is handled, with all answers posted
  receive(message: ToExtension): Promise<void>;
  // What a change in the repository does, without waiting for one
  refresh(): Promise<void>;
  dispose(): void;
}

interface Session {
  readonly post: (message: ToWebview) => void;
  watcher: vscode.Disposable | undefined;
  // Set once the page is gone, so nothing is posted to it, as posting to a
  // disposed webview throws, and nothing starts watching for it anymore
  disposed: boolean;
}

interface Context extends RepositoryAt {
  readonly tab: Tab;
  // Drops messages once the user switched to another tab, and all of them
  // while preloading
  readonly post: (message: ToWebview) => void;
}

export class FastforwardView implements vscode.CustomReadonlyEditorProvider {
  private readonly tabStates = new Map<string, Tab>();
  private readonly storage: Storage;

  constructor(
    private readonly log: vscode.LogOutputChannel,
    private readonly extensionUri: vscode.Uri,
    workspaceState: vscode.Memento,
    globalState: vscode.ExtensionContext['globalState'],
  ) {
    this.storage = new Storage(workspaceState, globalState);
  }

  get isShown(): boolean {
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

  async hide(): Promise<void> {
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
    // Git results can arrive after the modal closed; they are dropped then
    panel.onDidDispose(() => connection.dispose());
  }

  // Handles one page's messages, answering through post; the webview uses it,
  // and so do tests, without a webview
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
        this.run(message.type, session, () => this.handle(message, session)),
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
  ): Promise<void> {
    try {
      await action();
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      this.log.error(`${name} failed`);
      this.log.error(error instanceof Error ? error : text);
      session.post({ type: 'error', message: text });
    }
  }

  // Messages about the tabs and the settings, and those about a tab that are
  // saved for it whether it is shown or not; the others go on to handleTab
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
        await storage.setTabs(
          [...storage.tabs, ...new Set(added)],
          storage.activeTab,
        );
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
        // The setting applies to every merge again; the tabs in the
        // background show it when they come back
        for (const tab of this.tabStates.values()) {
          tab.toggledMerges.clear();
          tab.shownStale = true;
        }
        const context = await this.context(git, session);
        if (context) {
          await this.sendShownHistory(context, undefined);
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
        // About a tab the user has left since
        if (this.isActive(message.root)) {
          await this.handleTab(message, git, session);
        }
    }
  }

  // Messages about the tab shown
  private async handleTab(
    message: TabMessage,
    git: API,
    session: Session,
  ): Promise<void> {
    const context = await this.context(git, session);
    if (!context) {
      return;
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
      case 'toggleMerge': {
        const toggled = context.tab.toggledMerges;
        if (!toggled.delete(message.hash)) {
          toggled.add(message.hash);
        }
        await this.sendShownHistory(context, message.hash);
        break;
      }
      case 'checkout':
        await this.checkout(context, message.target);
        break;
      case 'fetch':
        await this.fetch(context);
        break;
      case 'loadTree':
        await this.sendTree(context, message.hash);
        break;
      case 'jump': {
        // A hash typed in the address bar can be short
        const hash = /^[0-9a-f]{40}$/.test(message.hash)
          ? message.hash
          : await commitOf(context.gitPath, context.root, message.hash);
        if (hash) {
          await this.showCommit(context, hash);
        } else {
          context.post({
            type: 'error',
            message: `No commit ${message.hash}`,
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
        context.tab.hash = message.hash;
        context.tab.index = positionOf(context.tab, message.hash);
        context.tab.path = undefined;
        // Nothing selected shows no files or diff when the view reopens
        if (!message.hash) {
          context.tab.shown.files = undefined;
          context.tab.shown.diff = undefined;
        }
        await this.sendCommit(context);
        break;
      case 'selectFile':
        context.tab.path = message.path;
        await this.sendDiff(context, message.hash);
        break;
      case 'loadFileDiff':
        await this.sendFileDiff(context, message.hash, message.path);
        break;
      default:
        // Saved by handle
        break;
    }
  }

  // The first tab is the repository open in VS Code
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
      // Another tab was opened while this one preloaded
      if (this.storage.activeTab !== active) {
        return;
      }
      for (const message of replayOf(tab)) {
        session.post(message);
      }
    }
    session.watcher?.dispose();
    session.watcher = undefined;
    const context = await this.context(git, session);
    // Another tab was opened, or the page closed, while this one looked up
    // its repository
    if (
      !context ||
      session.disposed ||
      this.storage.activeTab !== context.root
    ) {
      return;
    }
    this.log.info(
      `Tab ${context.root} uses the repository at ${context.repository.rootUri.fsPath}, HEAD ${checkedOutBranch(context.repository.state.HEAD) ?? '(detached)'} ${context.repository.state.HEAD?.commit ?? ''}`,
    );
    this.watch(context, session);
    await this.storage.addRecent(context.root);
    // The first time a tab opens it starts at what is checked out; later, it
    // is where it was left
    const firstOpen = !context.tab.opened;
    context.tab.opened = true;
    // Coming back, the page shows the tab as it was left, and only what
    // changed since is sent, like after a change in the repository, instead
    // of reloading a history that took half a second for 190k commits
    if (!firstOpen && context.tab.shown.commits) {
      this.log.info(`Tab ${context.root} is shown as it was left`);
      await this.addDefaultBookmarks(context);
      await this.refresh(context);
      return;
    }
    await this.loadTab(context, firstOpen);
  }

  // Loads a tab's bookmarks, history, uncommitted changes and refs, listing
  // the refs once for all of them, and selects what is checked out, or else
  // the commit selected before
  private async loadTab(context: Context, atHead: boolean): Promise<void> {
    const refs = listRefs(context.repository);
    await Promise.all([
      this.addDefaultBookmarks(context, refs),
      // In the place of a refresh, as the watcher's first refresh can come
      // while the history loads, which would load it a second time at once
      this.refresh(context, async (latest) => {
        // Unless a refresh that ran first loaded it already
        if (latest.tab.fingerprint === '') {
          await this.sendCommits(latest, refs);
        }
        await (atHead ? this.showHead(latest) : this.sendCommit(latest));
      }),
      this.sendWorkingTree(context),
      this.sendRepository(context, refs),
    ]);
  }

  // Loads a tab the way it first opens, at what is checked out, without
  // showing it; opening it then only checks what changed since, like coming
  // back to it; a tab that is open, or was, needs nothing
  private async preloadTab(
    git: API,
    session: Session,
    root: string,
  ): Promise<void> {
    if (!this.storage.tabs.includes(root) || root === this.storage.activeTab) {
      return;
    }
    const tab = this.tabState(root);
    if (tab.opened || tab.preloading) {
      return;
    }
    tab.preloading = (async () => {
      try {
        // Its messages are only kept for opening it, even if it is opened
        // meanwhile, which waits for this and then shows them once
        const context = await this.context(git, session, root, false);
        if (!context || tab.opened) {
          return;
        }
        this.log.info(`Preloading tab ${root}`);
        tab.opened = true;
        await this.loadTab(context, true);
      } catch (error) {
        // Opening the tab loads it the usual way then
        tab.opened = false;
        tab.shown = {};
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

  // The first time a repository opens, its main branch becomes a bookmark: the
  // remote's default branch, or else a local main, master or trunk, with the
  // local and remote branch of the same name; removing them later sticks, as
  // the repository has a saved list from then on
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
        refreshAgain: false,
        refreshContext: undefined,
      };
      this.tabStates.set(root, tab);
    }
    return tab;
  }

  private async context(
    git: API,
    session: Session,
    root = this.storage.activeTab,
    // Whether messages go to the page while the tab is shown, or are only
    // kept for replaying
    live = true,
  ): Promise<Context | undefined> {
    if (!root) {
      return undefined;
    }
    // The repository at the tab's folder; getRepository would give the outer
    // repository for one cloned inside another, and checkout and fetch would
    // then act on that; repositories outside the workspace have to be
    // opened first, which also shows them in the Source Control view
    const uri = vscode.Uri.file(root);
    const repository =
      git.repositories.find(
        (candidate) => path.relative(candidate.rootUri.fsPath, root) === '',
      ) ??
      (await git.openRepository(uri)) ??
      git.getRepository(uri);
    if (!repository) {
      // Only the tab that is shown says so
      if (live && this.storage.activeTab === root) {
        session.post({
          type: 'error',
          message: `${root} is not a git repository`,
        });
      }
      return undefined;
    }
    // A repository the Git extension just opened may not have read its state
    // yet, which would show no branch checked out
    if (!repository.state.HEAD) {
      await repository.status();
    }
    const tab = this.tabState(root);
    return {
      gitPath: git.git.path,
      repository,
      root,
      tab,
      post: (message) => {
        keep(tab.shown, message);
        if (live && this.storage.activeTab === root) {
          session.post(message);
        }
      },
    };
  }

  // Keeps the uncommitted changes row up to date while the view is open
  private watch(context: Context, session: Session): void {
    session.watcher?.dispose();
    let timer: NodeJS.Timeout | undefined;
    const subscription = context.repository.state.onDidChange(() => {
      clearTimeout(timer);
      timer = setTimeout(
        () => void this.run('refresh', session, () => this.refresh(context)),
        300,
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
    // Shows the new checkout right away, without waiting for the Git
    // extension to notice it, and jumps there
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

  // Records a step in the tab's history, from the commit shown now
  private visit(context: Context, hash: string, replace = false): void {
    const { tab } = context;
    const next = visit(tab.navigation, tab.hash, hash, replace);
    if (next !== tab.navigation) {
      tab.navigation = next;
      void this.sendNavigation(context).catch((error: unknown) =>
        this.log.error(error instanceof Error ? error : String(error)),
      );
    }
  }

  // The history's nearest steps both ways, with their subjects, for the
  // buttons and their dropdowns
  private async sendNavigation(context: Context): Promise<void> {
    const { tab } = context;
    const { navigation } = tab;
    const { back, forward } = nearestSteps(tab);
    // Commits the page never loaded, like one left by a jump before its page
    // came, are the only ones git is asked about
    const unknown = [...new Set([...back, ...forward])].filter(
      (hash) => hash !== workingTreeHash && !tab.subjects.has(hash),
    );
    if (unknown.length > 0) {
      keepSubjects(
        tab,
        await logCommits(context.gitPath, context.root, unknown),
      );
      // Another step was taken while git ran
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

  // Says which commit a typed hash is, for the address bar's suggestion
  private async lookupHash(context: Context, query: string): Promise<void> {
    const result = await findCommit(context.gitPath, context.root, query);
    context.post({ type: 'hashLookup', query, result });
  }

  // Back or forward in the tab's history, to a commit that is still there
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
      select(tab, workingTreeHash, -1);
      context.post({ type: 'reveal', hash: workingTreeHash, index: -1 });
      await this.sendCommit(context);
    } else {
      await this.showCommit(context, result.target, false);
    }
    await this.sendNavigation(context);
  }

  // Selects a commit and scrolls the list to it, expanding the collapsed
  // merges that hide it, like a merged branch's tip
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
        await this.sendShownHistory(context, hash);
      }
    }
    const index = tab.positions.get(hash);
    if (index === undefined) {
      context.post({ type: 'error', message: `${hash} is not in the history` });
      return;
    }
    if (record) {
      this.visit(context, hash);
    }
    select(tab, hash, index);
    context.post({ type: 'reveal', hash, index });
    await this.sendCommit(context);
  }

  // Selects what is checked out; asks git, as the Git extension may not have
  // read a repository it just opened yet
  private async showHead(context: Context): Promise<void> {
    const head = await headCommit(context.gitPath, context.root);
    // Nothing to show before the first commit
    if (head) {
      await this.showCommit(context, head);
    }
  }

  // After a change in the repository: the uncommitted changes always, and the
  // history when a commit, checkout, fetch or branch change moved HEAD or a
  // ref, keeping the list's place; one at a time per tab, as two history
  // loads at once could let the older one win: a change during one refreshes
  // once more after it, and a tab's first load, given as load, waits its turn
  private refresh(
    context: Context,
    load?: (context: Context) => Promise<void>,
  ): Promise<void> {
    const { tab } = context;
    tab.refreshContext = context;
    if (tab.refreshing) {
      if (!load) {
        tab.refreshAgain = true;
        return tab.refreshing;
      }
      // A load isn't a refresh to fold into the running one, so it waits
      return tab.refreshing
        .catch(() => undefined)
        .then(() => this.refresh(context, load));
    }
    tab.refreshing = (async () => {
      try {
        let next = load ?? ((latest: Context) => this.refreshOnce(latest));
        do {
          tab.refreshAgain = false;
          await next(tab.refreshContext ?? context);
          next = (latest) => this.refreshOnce(latest);
        } while (tab.refreshAgain);
      } finally {
        tab.refreshing = undefined;
        tab.refreshContext = undefined;
      }
    })();
    return tab.refreshing;
  }

  // The uncommitted changes and the history side by side, as neither waits
  // for the other
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

  // Reloads the history when HEAD or a ref moved
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
    } else if (context.tab.shownStale) {
      await this.sendShownHistory(context, undefined, true);
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
      listHistory(context.gitPath, context.root),
      refs,
    ]);
    const { tab } = context;
    loadHistory(tab, fullHistory, context.repository.state.HEAD, listed);
    await this.sendShownHistory(context, undefined, keepPlace);
    // Steps whose commit the reload dropped, like after a rebase, leave the
    // dropdowns, and the buttons when none is left
    const { back, forward } = tab.navigation;
    if (back.length + forward.length > 0) {
      await this.sendNavigation(context);
    }
  }

  // Works out which commits are shown with the merges collapsed or expanded,
  // lays out their graph, and sends the list; scrollTo is a commit to keep in
  // view, the selected one by default, and keepPlace keeps the commit at the
  // top of the list where it is instead, for reloads the user didn't ask for
  private async sendShownHistory(
    context: Context,
    scrollTo: string | undefined,
    keepPlace = false,
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
    const page = firstPage(tab, keepPlace);
    const commits = await logCommits(
      context.gitPath,
      context.root,
      tab.history
        .slice(page.start, page.start + 2 * commitPageSize)
        .map((entry) => entry.hash),
    );
    keepSubjects(tab, commits);
    // A newer list was worked out while git ran
    if (tab.generation !== generation) {
      return;
    }
    context.post(commitsMessage(tab, page, commits, scrollTo));
  }

  private async sendCommitPage(
    context: Context,
    generation: number,
    start: number,
    count: number,
  ): Promise<void> {
    const { tab } = context;
    // Asked of a history shown before, which the page replaces soon, or was
    // reloaded while this page loaded
    const replaced = () => tab.generation !== generation;
    if (replaced()) {
      return;
    }
    const { history, graph } = tab;
    const commits = await logCommits(
      context.gitPath,
      context.root,
      history.slice(start, start + count).map((entry) => entry.hash),
    ).catch((error: unknown) => {
      // No commits, so the list asks for them again instead of showing
      // placeholders for good
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
      // Picked in a list the history has replaced since; the error ends the
      // placeholders the page shows while it waits for the files and diff
      context.post({ type: 'error', message: `${hash} is not in the history` });
      return;
    }
    // Another commit was selected while git ran
    if (context.tab.hash !== hash) {
      return;
    }
    context.tab.changedFiles = new Map(files.map((file) => [file.path, file]));
    if (workingTree) {
      context.tab.workingTree = workingTree;
    }
    // A refresh doesn't send what the page shows already; a selection always
    // sends, as the page cleared its files and diff when it asked
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

  // The diff of one large file the commit's diff left out
  private async sendFileDiff(
    context: Context,
    hash: string,
    file: string,
  ): Promise<void> {
    const change = context.tab.changedFiles.get(file);
    const patch = await this.patchOf(context, hash, {
      path: file,
      oldPath: change?.oldPath,
    });
    if (context.tab.hash === hash) {
      context.post({ type: 'fileDiff', hash, path: file, patch });
    }
  }

  // A commit's patch, or that of the uncommitted changes whose files were
  // sent last
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

  // A refresh doesn't send the files the page lists already
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
    // Another commit or file was selected while git ran
    const stale = () => context.tab.hash !== hash || context.tab.path !== file;
    const change =
      file === undefined ? undefined : context.tab.changedFiles.get(file);
    // A file the commit didn't change, picked in the Files view, has no diff
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
    // A whole commit leaves its large files out, which the webview asks for
    // when one is opened
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

// The remote branch the checked-out branch tracks, like origin/main
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
