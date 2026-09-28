import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { API, Repository } from './git/git';
import { Graph } from './git/graph';
import { noNavigation, step, visit, type Navigation } from './navigation';
import {
  checkedOutBranch,
  countRefs,
  decorations as refDecorations,
  defaultBookmarks,
  fingerprint,
} from './refs';
import {
  headsOf,
  mergesHiding,
  showHistory,
  type ShownEntry,
} from './git/merges';
import { getGitApi, listRefs, pickRepository } from './git/repository';
import {
  aheadBehind,
  findCommit,
  headCommit,
  listHistory,
  listTree,
  logCommits,
  readFile,
  remoteDefaultBranches,
  runGit,
  showFiles,
  showPatch,
  workingTreeFiles,
  workingTreePatch,
  type HistoryEntry,
  type PatchScope,
  type WorkingTree,
} from './git/show';
import {
  commitPageSize,
  isLargeChange,
  workingTreeHash,
  type CheckoutTarget,
  type CommitInfo,
  type SyncAction,
  type FileChange,
  type RefInfo,
  type ChangesView,
  type FilesMode,
  type ToExtension,
  type ToWebview,
  type Bookmark,
} from './protocol';

export const toggleViewCommand = 'fastforward.toggleView';
export const showViewCommand = 'fastforward.showView';
export const viewType = 'fastforward.view';
const viewTitle = '⏩ Fastforward';
// resourceLabelFormatters in package.json blanks the label of this URI, so the
// modal doesn't show its path next to the title
const viewUri = vscode.Uri.from({ scheme: 'fastforward', path: '/view' });

// The view is a custom editor, because _workbench.openWith is the only way for
// an extension to open an editor in the modal editor part (group -4)
const modalEditorGroup = -4;

// Repository roots of the open tabs, kept per workspace
const tabsKey = 'tabs';
const activeTabKey = 'activeTab';
// Repository roots opened in any workspace, most recent first, offered by +
const recentKey = 'recentRepositories';
const maxRecent = 20;
// Column widths, per user and synced across machines, as they are a personal
// preference rather than something about a workspace
const columnWidthsKey = 'columnWidths';
// Whether merge commits start collapsed, like Sublime Merge's setting; per
// user and synced
const collapseMergesKey = 'collapseMerges';
// What the Files column lists, per user and synced
const filesModeKey = 'filesMode';
// Whether the Changes tab is a list or a tree, per user and synced
const changesViewKey = 'changesView';
// Bookmarked refs by repository root, per user; not synced, as roots are
// paths on this machine; named vips, as bookmarks were called at first
const bookmarksKey = 'vips';

// Kept in the extension, because the webview is recreated every time the modal
// opens
interface TabState {
  hash: string | undefined;
  // Position of the selected commit in the history
  index: number | undefined;
  path: string | undefined;
  // The files the selected commit changed; others picked in the Files view
  // are shown whole instead of as a diff
  changedFiles: Map<string, FileChange>;
  // The uncommitted changes those files are, when they are selected, whose
  // diff is taken against the same base and untracked files
  workingTree: WorkingTree | undefined;
  // Every commit of every branch, remote and tag, newest first, and their
  // hashes, to tell whether one is still there
  fullHistory: readonly HistoryEntry[];
  inHistory: Set<string>;
  // The subjects of the commits sent, which the back and forward dropdowns
  // list without asking git again
  subjects: Map<string, string>;
  // Its commits that nothing is built on yet
  heads: Set<string>;
  // HEAD and every ref when the history loaded; the history is reloaded when
  // they change
  fingerprint: string;
  // The commit at the top of the list and how far it is scrolled into it,
  // which a reload keeps in place
  anchor: { hash: string; offset: number } | undefined;
  // Whether the tab was opened in this session, which starts it at HEAD
  opened: boolean;
  // Loading in the background, before the tab is opened
  preloading: Promise<void> | undefined;
  // The commits shown before and after, for back and forward
  navigation: Navigation;
  // The commits refs point at, which are always shown, and how many refs
  // point at each
  refCounts: Map<string, number>;
  // Merges the user expanded or collapsed, unlike the setting says
  toggledMerges: Set<string>;
  // The commits shown, with merges collapsed or expanded, and each commit's
  // position in it; pages and jumps are looked up here
  history: readonly ShownEntry[];
  positions: Map<string, number>;
  // Counts the histories shown, so a page asked of one isn't answered from
  // the next, and a list that took longer to send than a newer one is dropped
  generation: number;
  // The lanes of the history, laid out when it loads
  graph: Graph;
  // The merge setting changed while the tab was in the background, which
  // shows its history again when it comes back, without reloading it
  shownStale: boolean;
  shown: Shown;
  // The load or refresh that is running, and whether another change came in
  // during it, which runs a refresh once more instead of in parallel, with
  // the context of the last one asked for, whose page may be a newer one
  refreshing: Promise<void> | undefined;
  refreshAgain: boolean;
  refreshContext: Context | undefined;
}

type Message<T extends ToWebview['type']> = Extract<ToWebview, { type: T }>;

// What a tab shows, from the last messages sent for it, which are replayed
// when the tab or the modal opens again so it shows up instantly, before the
// refresh; only these, as the others either happen once, like jumps and
// errors, are answers the page asks for again, like pages of commits, or are
// saved elsewhere, like the bookmarks
interface Shown {
  repository?: Message<'repository'>;
  syncing?: Message<'syncing'>;
  navigation?: Message<'navigation'>;
  commits?: Message<'commits'>;
  workingTree?: Message<'workingTree'>;
  files?: Message<'files'>;
  // The Diff column shows a diff or a whole file, whichever came last
  diff?: Message<'diff'> | Message<'fileContent'>;
  tree?: Message<'tree'>;
}

// One per open webview
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
  // Set once the page is gone, so nothing starts watching for it anymore
  disposed: boolean;
}

interface Context {
  readonly git: API;
  readonly repository: Repository;
  readonly root: string;
  readonly tab: TabState;
  // Drops messages once the user switched to another tab, and all of them
  // while preloading
  readonly post: (message: ToWebview) => void;
}

export class FastforwardView implements vscode.CustomReadonlyEditorProvider {
  private readonly tabStates = new Map<string, TabState>();

  constructor(
    private readonly log: vscode.LogOutputChannel,
    private readonly extensionUri: vscode.Uri,
    private readonly workspaceState: vscode.Memento,
    private readonly globalState: vscode.ExtensionContext['globalState'],
  ) {
    globalState.setKeysForSync([
      columnWidthsKey,
      collapseMergesKey,
      filesModeKey,
      changesViewKey,
    ]);
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
    // Git results can arrive after the modal closed; they are dropped then,
    // as posting to a disposed webview throws
    let disposed = false;
    const connection = this.connect((message) => {
      if (!disposed) {
        void panel.webview.postMessage(message);
      }
    });
    panel.webview.onDidReceiveMessage(
      (message: ToExtension) => void connection.receive(message),
    );
    panel.onDidDispose(() => {
      disposed = true;
      connection.dispose();
    });
  }

  // Handles one page's messages, answering through post; the webview uses it,
  // and so do tests, without a webview
  connect(post: (message: ToWebview) => void): Connection {
    const session: Session = { post, watcher: undefined, disposed: false };
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

  // Once each, as tabs saved before could have a folder twice
  private get tabs(): string[] {
    return uniqueRoots(this.workspaceState.get<string[]>(tabsKey, []));
  }

  private get activeTab(): string | undefined {
    return this.workspaceState.get<string>(activeTabKey);
  }

  private isActive(root: string): boolean {
    const active = this.activeTab;
    return active !== undefined && sameRoot(active, root);
  }

  private async setTabs(tabs: string[], active: string | undefined) {
    await this.workspaceState.update(tabsKey, uniqueRoots(tabs));
    await this.workspaceState.update(activeTabKey, active);
  }

  private get recent(): string[] {
    return this.globalState.get<string[]>(recentKey, []);
  }

  private async addRecent(root: string): Promise<void> {
    const recent = [root, ...this.recent.filter((r) => !sameRoot(r, root))];
    await this.globalState.update(recentKey, recent.slice(0, maxRecent));
  }

  private async removeRecent(root: string): Promise<void> {
    await this.globalState.update(
      recentKey,
      this.recent.filter((r) => !sameRoot(r, root)),
    );
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

  private async handle(message: ToExtension, session: Session): Promise<void> {
    const git = await getGitApi();
    switch (message.type) {
      case 'ready':
        session.post({
          type: 'layout',
          columnWidths: this.globalState.get<number[]>(columnWidthsKey),
          collapseMerges: this.globalState.get(collapseMergesKey, true),
          filesMode: this.globalState.get<FilesMode>(filesModeKey, 'changes'),
          changesView: this.globalState.get<ChangesView>(
            changesViewKey,
            'list',
          ),
        });
        await this.addWorkspaceTab(git);
        await this.openTab(git, session, this.activeTab);
        return;
      case 'selectTab':
        await this.openTab(git, session, message.root);
        return;
      case 'addTab': {
        const roots = await this.pickRepositories(git);
        for (const root of roots) {
          await this.addRecent(root);
        }
        const added = roots.filter((root) => !this.hasTab(root));
        await this.setTabs([...this.tabs, ...new Set(added)], this.activeTab);
        const last = roots.at(-1);
        if (last) {
          await this.openTab(git, session, last);
        }
        return;
      }
      case 'closeTab': {
        const index = this.tabs.findIndex((tab) => sameRoot(tab, message.root));
        const tabs = this.tabs.filter((tab) => !sameRoot(tab, message.root));
        this.tabStates.delete(message.root);
        const active =
          this.activeTab !== undefined && sameRoot(this.activeTab, message.root)
            ? tabs[Math.min(index, tabs.length - 1)]
            : this.activeTab;
        await this.setTabs(tabs, active);
        await this.openTab(git, session, active);
        return;
      }
      case 'preloadTab':
        await this.preloadTab(git, session, message.root);
        return;
      case 'sortTabs': {
        const tabs = this.tabs.toSorted((a, b) =>
          path.basename(a).localeCompare(path.basename(b), undefined, {
            sensitivity: 'base',
          }),
        );
        await this.setTabs(tabs, this.activeTab);
        this.postTabs(session);
        return;
      }
      case 'log':
        this.log[message.level](`Webview: ${message.message}`);
        return;
      case 'setColumnWidths':
        await this.globalState.update(columnWidthsKey, message.widths);
        return;
      case 'setFilesMode':
        await this.globalState.update(filesModeKey, message.mode);
        return;
      case 'setChangesView':
        await this.globalState.update(changesViewKey, message.view);
        return;
      case 'setCollapseMerges': {
        await this.globalState.update(collapseMergesKey, message.collapse);
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
        await this.setBookmarks(message.root, message.bookmarks);
        return;
      case 'scrolled': {
        const tab = this.tabStates.get(message.root);
        if (tab) {
          tab.anchor = { hash: message.hash, offset: message.offset };
        }
        return;
      }
    }

    // About a tab the user has left since
    if ('root' in message && !this.isActive(message.root)) {
      return;
    }
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
      case 'sync':
        await this.sync(context, message.action);
        break;
      case 'loadTree':
        await this.sendTree(context, message.hash);
        break;
      case 'jump': {
        // A hash typed in the address bar can be short
        const hash = /^[0-9a-f]{40}$/.test(message.hash)
          ? message.hash
          : await commitOf(context, message.hash);
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
    }
  }

  // The first tab is the repository open in VS Code
  private async addWorkspaceTab(git: API): Promise<void> {
    const root = pickRepository(git)?.rootUri.fsPath;
    if (root && !this.hasTab(root)) {
      await this.setTabs([root, ...this.tabs], this.activeTab ?? root);
    }
  }

  private hasTab(root: string): boolean {
    return this.tabs.some((tab) => sameRoot(tab, root));
  }

  // Offers recent repositories first, and the folder picker as the last item
  private async pickRepositories(git: API): Promise<string[]> {
    const recent = this.recent.filter((root) => !this.hasTab(root));
    if (recent.length > 0) {
      const browse: vscode.QuickPickItem = {
        label: '$(folder-opened) Browse...',
        alwaysShow: true,
      };
      const picked = await vscode.window.showQuickPick(
        [
          ...recent.map((root) => ({
            label: path.basename(root),
            description: root,
          })),
          { label: '', kind: vscode.QuickPickItemKind.Separator },
          browse,
        ],
        {
          placeHolder: 'Open a repository in a new tab',
          matchOnDescription: true,
        },
      );
      if (!picked) {
        return [];
      }
      if (picked !== browse && picked.description) {
        const root = await this.checkRepository(
          git,
          vscode.Uri.file(picked.description),
        );
        return root ? [root] : [];
      }
    }
    return this.browseRepositories(git);
  }

  private async browseRepositories(git: API): Promise<string[]> {
    const folders =
      (await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: true,
        openLabel: 'Open Repositories',
      })) ?? [];
    const roots = await Promise.all(
      folders.map((folder) => this.checkRepository(git, folder)),
    );
    return roots.filter((root) => root !== undefined);
  }

  private async checkRepository(
    git: API,
    folder: vscode.Uri,
  ): Promise<string | undefined> {
    const root = await git.getRepositoryRoot(folder);
    if (!root) {
      await this.removeRecent(folder.fsPath);
      void vscode.window.showErrorMessage(
        `Fastforward: ${folder.fsPath} is not in a git repository`,
      );
      return undefined;
    }
    return root.fsPath;
  }

  private async openTab(
    git: API,
    session: Session,
    root: string | undefined,
  ): Promise<void> {
    const active =
      (root && this.tabs.find((tab) => sameRoot(tab, root))) ?? this.tabs[0];
    await this.setTabs(this.tabs, active);
    this.postTabs(session);
    if (active) {
      const tab = this.tabState(active);
      await tab.preloading;
      // Another tab was opened while this one preloaded
      if (this.activeTab !== active) {
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
    if (!context || session.disposed || this.activeTab !== context.root) {
      return;
    }
    this.log.info(
      `Tab ${context.root} uses the repository at ${context.repository.rootUri.fsPath}, HEAD ${checkedOutBranch(context.repository.state.HEAD) ?? '(detached)'} ${context.repository.state.HEAD?.commit ?? ''}`,
    );
    this.watch(context, session);
    await this.addRecent(context.root);
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
    if (!this.tabs.includes(root) || root === this.activeTab) {
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
    const active = this.activeTab;
    session.post({
      type: 'tabs',
      tabs: this.tabs.map((tab) => ({ root: tab, name: path.basename(tab) })),
      active,
    });
    session.post({
      type: 'bookmarks',
      bookmarks: active ? (this.bookmarksOf(active) ?? []) : [],
    });
  }

  // Undefined for a repository that never had bookmarks saved
  private bookmarksOf(root: string): readonly Bookmark[] | undefined {
    return this.globalState.get<Record<string, Bookmark[]>>(bookmarksKey, {})[
      root
    ];
  }

  // The first time a repository opens, its main branch becomes a bookmark: the
  // remote's default branch, or else a local main, master or trunk, with the
  // local and remote branch of the same name; removing them later sticks, as
  // the repository has a saved list from then on
  private async addDefaultBookmarks(
    context: Context,
    refs?: Promise<readonly RefInfo[]>,
  ): Promise<void> {
    if (this.bookmarksOf(context.root) !== undefined) {
      return;
    }
    const [listed, defaults] = await Promise.all([
      refs ?? listRefs(context.repository),
      remoteDefaultBranches(context.git.git.path, context.root),
    ]);
    const bookmarks = defaultBookmarks(listed, defaults);
    await this.setBookmarks(context.root, bookmarks);
    context.post({ type: 'bookmarks', bookmarks });
  }

  private async setBookmarks(
    root: string,
    bookmarks: readonly Bookmark[],
  ): Promise<void> {
    const all = this.globalState.get<Record<string, readonly Bookmark[]>>(
      bookmarksKey,
      {},
    );
    await this.globalState.update(bookmarksKey, { ...all, [root]: bookmarks });
  }

  private tabState(root: string): TabState {
    let tab = this.tabStates.get(root);
    if (!tab) {
      tab = {
        hash: undefined,
        index: undefined,
        path: undefined,
        changedFiles: new Map(),
        workingTree: undefined,
        fullHistory: [],
        inHistory: new Set(),
        subjects: new Map(),
        heads: new Set(),
        fingerprint: '',
        anchor: undefined,
        opened: false,
        refCounts: new Map(),
        toggledMerges: new Set(),
        history: [],
        positions: new Map(),
        generation: 0,
        graph: new Graph([]),
        shownStale: false,
        shown: {},
        refreshing: undefined,
        preloading: undefined,
        navigation: noNavigation,
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
    root = this.activeTab,
    // Whether messages go to the page while the tab is shown, or are only
    // kept for replaying
    live = true,
  ): Promise<Context | undefined> {
    if (!root) {
      return undefined;
    }
    // The repository at the tab's folder; getRepository would give the outer
    // repository for one cloned inside another, and checkout, pull and push
    // would then act on that; repositories outside the workspace have to be
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
      if (live && this.activeTab === root) {
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
      git,
      repository,
      root,
      tab,
      post: (message) => {
        keep(tab.shown, message);
        if (live && this.activeTab === root) {
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

  // Checks out a branch, a remote branch, a tag or a commit; git refuses when
  // uncommitted changes would be overwritten, which is shown as a notification;
  // a remote branch switches to its local branch, which is created when there
  // is none, or else fast-forwarded when it is behind, so it ends up where the
  // remote branch is, as if it were checked out itself
  private async checkout(
    context: Context,
    target: CheckoutTarget,
  ): Promise<void> {
    const { repository } = context;
    const label = target.kind === 'commit' ? target.hash : target.name;
    try {
      if (target.kind === 'remote') {
        const local = target.name.slice(target.name.indexOf('/') + 1);
        const refs = await listRefs(repository);
        if (refs.some((ref) => ref.kind === 'branch' && ref.name === local)) {
          await repository.checkout(local);
          await this.catchUp(context, local, target.name);
        } else {
          await repository.createBranch(local, true, target.name);
          await repository.setBranchUpstream(local, target.name);
        }
      } else {
        await repository.checkout(
          target.kind === 'commit'
            ? target.hash
            : target.kind === 'tag'
              ? `refs/tags/${target.name}`
              : target.name,
        );
      }
      this.log.info(`Checked out ${target.kind} ${label}`);
    } catch (error) {
      const details = gitErrorText(error);
      this.log.error(`Checking out ${target.kind} ${label} failed`);
      this.log.error(details);
      void vscode.window.showErrorMessage(
        `Fastforward: couldn't check out ${label}. ${details}`,
      );
      return;
    }
    // Shows the new checkout right away, without waiting for the Git
    // extension to notice it, and jumps there
    await repository.status();
    await this.refresh(context);
    await this.showHead(context);
  }

  // Fast-forwards the checked-out local branch to the remote branch when it is
  // behind; with commits of its own it stays, as combining them is a decision
  // for a pull, and the user is told when both sides have commits
  private async catchUp(
    context: Context,
    local: string,
    remote: string,
  ): Promise<void> {
    const gitPath = context.git.git.path;
    const { ahead, behind } = await aheadBehind(
      gitPath,
      context.root,
      `refs/heads/${local}`,
      `refs/remotes/${remote}`,
    );
    if (behind === 0) {
      return;
    }
    if (ahead > 0) {
      this.log.info(
        `${local} and ${remote} have diverged, not fast-forwarding`,
      );
      void vscode.window.showInformationMessage(
        `Fastforward: switched to ${local}, which has diverged from ${remote}; pull to combine them.`,
      );
      return;
    }
    try {
      await runGit(gitPath, context.root, [
        'merge',
        '--ff-only',
        `refs/remotes/${remote}`,
      ]);
      this.log.info(`Fast-forwarded ${local} to ${remote}`);
    } catch (error) {
      const details = gitErrorText(error);
      this.log.error(`Fast-forwarding ${local} to ${remote} failed`);
      this.log.error(details);
      void vscode.window.showErrorMessage(
        `Fastforward: switched to ${local}, but couldn't fast-forward it to ${remote}. ${details}`,
      );
    }
  }

  // Pulls the checked-out branch from its upstream, or pushes it there, as
  // VS Code's own Pull and Push do, with its credentials and settings
  private async sync(context: Context, action: SyncAction): Promise<void> {
    const { repository } = context;
    context.post({ type: 'syncing', action });
    try {
      if (action === 'pull') {
        await repository.pull();
      } else if (action === 'push') {
        await repository.push();
      } else {
        await repository.fetch({ all: true, prune: true });
      }
      this.log.info(
        action === 'fetch'
          ? 'Fetched every remote'
          : `${action === 'pull' ? 'Pulled' : 'Pushed'} ${repository.state.HEAD?.name ?? ''}`,
      );
    } catch (error) {
      const details = gitErrorText(error);
      this.log.error(`${action} failed`);
      this.log.error(details);
      void vscode.window.showErrorMessage(
        `Fastforward: couldn't ${action}. ${details}`,
      );
    } finally {
      context.post({ type: 'syncing', action: undefined });
    }
    await repository.status();
    await this.refresh(context);
  }

  // Selects a commit and scrolls the list to it, expanding the collapsed
  // merges that hide it, like a merged branch's tip
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
  // buttons and their dropdowns; only the steps whose commit is still there,
  // which are the ones navigate counts, so a picked step is the one it goes to
  private async sendNavigation(context: Context): Promise<void> {
    const { tab } = context;
    const { navigation } = tab;
    const exists = stillThere(tab);
    const nearest = (steps: readonly string[]) =>
      steps.filter(exists).toReversed().slice(0, navigationShown);
    const back = nearest(navigation.back);
    const forward = nearest(navigation.forward);
    // Commits the page never loaded, like one left by a jump before its page
    // came, are the only ones git is asked about
    const unknown = [...new Set([...back, ...forward])].filter(
      (hash) => hash !== workingTreeHash && !tab.subjects.has(hash),
    );
    if (unknown.length > 0) {
      keepSubjects(
        tab,
        await logCommits(context.git.git.path, context.root, unknown),
      );
      // Another step was taken while git ran
      if (tab.navigation !== navigation) {
        return;
      }
    }
    const entry = (hash: string) => ({
      hash,
      subject:
        hash === workingTreeHash
          ? 'Uncommitted changes'
          : tab.subjects.get(hash),
    });
    context.post({
      type: 'navigation',
      back: back.map(entry),
      forward: forward.map(entry),
    });
  }

  // Says which commit a typed hash is, for the address bar's suggestion
  private async lookupHash(context: Context, query: string): Promise<void> {
    const result = await findCommit(context.git.git.path, context.root, query);
    context.post({ type: 'hashLookup', query, result });
  }

  // Back or forward in the tab's history, to a commit that is still there
  private async navigate(
    context: Context,
    direction: 'back' | 'forward',
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
      tab.hash = workingTreeHash;
      tab.index = -1;
      tab.path = undefined;
      context.post({ type: 'reveal', hash: workingTreeHash, index: -1 });
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
    if (!context.tab.positions.has(hash)) {
      await this.expandMerges(
        context,
        mergesHiding(
          context.tab.fullHistory,
          new Set(context.tab.positions.keys()),
          hash,
        ),
        hash,
      );
    }
    const index = context.tab.positions.get(hash);
    if (index === undefined) {
      context.post({ type: 'error', message: `${hash} is not in the history` });
      return;
    }
    if (record) {
      this.visit(context, hash);
    }
    context.tab.hash = hash;
    context.tab.index = index;
    context.tab.path = undefined;
    context.post({ type: 'reveal', hash, index });
    await this.sendCommit(context);
  }

  // Selects what is checked out; asks git, as the Git extension may not have
  // read a repository it just opened yet
  private async showHead(context: Context): Promise<void> {
    const head = await headCommit(context.git.git.path, context.root);
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
    const workingTree = await workingTreeFiles(
      context.git.git.path,
      context.root,
    );
    context.post({ type: 'workingTree', files: workingTree.files.length });
    return workingTree;
  }

  private async sendCommits(
    context: Context,
    refs: Promise<readonly RefInfo[]>,
    keepPlace = false,
  ): Promise<void> {
    const [fullHistory, listed] = await Promise.all([
      listHistory(context.git.git.path, context.root),
      refs,
    ]);
    const { tab } = context;
    tab.fullHistory = fullHistory;
    tab.inHistory = new Set(fullHistory.map((entry) => entry.hash));
    tab.heads = headsOf(fullHistory);
    tab.fingerprint = fingerprint(context.repository.state.HEAD, listed);
    tab.refCounts = countRefs(listed, context.repository.state.HEAD);
    await this.sendShownHistory(context, undefined, keepPlace);
    // Steps whose commit the reload dropped, like after a rebase, leave the
    // dropdowns, and the buttons when none is left
    const { back, forward } = tab.navigation;
    if (back.length + forward.length > 0) {
      await this.sendNavigation(context);
    }
  }

  // Expands these merges, whatever the setting says, and sends the list
  private async expandMerges(
    context: Context,
    merges: readonly string[],
    scrollTo: string,
  ): Promise<void> {
    if (merges.length === 0) {
      return;
    }
    const collapse = this.globalState.get(collapseMergesKey, true);
    for (const merge of merges) {
      // Toggled merges are the ones that differ from the setting
      if (collapse) {
        context.tab.toggledMerges.add(merge);
      } else {
        context.tab.toggledMerges.delete(merge);
      }
    }
    await this.sendShownHistory(context, scrollTo);
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
    const collapse = this.globalState.get(collapseMergesKey, true);
    // Tips of branches that aren't merged, like Sublime Merge; merged branches
    // stay inside their collapsed merge even when a ref still points at them
    const tips = new Set(tab.heads);
    const head = context.repository.state.HEAD?.commit;
    if (head) {
      tips.add(head);
    }
    const history = showHistory(
      tab.fullHistory,
      tips,
      (hash) => collapse === tab.toggledMerges.has(hash),
    );
    tab.history = history;
    tab.positions = new Map(history.map((entry, index) => [entry.hash, index]));
    const generation = ++tab.generation;
    tab.graph = new Graph(history, { head });
    tab.shownStale = false;
    this.log.info(
      `Graph of ${history.length} of ${tab.fullHistory.length} commits laid out in ${Math.round(performance.now() - started)} ms, ${tab.graph.width} lanes wide`,
    );
    // The selected commit may have moved, or be hidden in a collapsed merge
    tab.index =
      tab.hash === undefined ? undefined : tab.positions.get(tab.hash);
    const decorations = refDecorations(tab.refCounts, tab.positions);
    // The page the list shows first: the top, or around the commit that stays
    // in place, so the list doesn't flash placeholders there
    const anchor = keepPlace ? anchorOf(tab) : undefined;
    const start =
      anchor === undefined || anchor.index < 0
        ? 0
        : anchor.index - (anchor.index % commitPageSize);
    const commits = await logCommits(
      context.git.git.path,
      context.root,
      history
        .slice(start, start + 2 * commitPageSize)
        .map((entry) => entry.hash),
    );
    keepSubjects(tab, commits);
    // A newer list was worked out while git ran
    if (tab.generation !== generation) {
      return;
    }
    context.post({
      type: 'commits',
      generation,
      total: history.length,
      decorations,
      graphWidth: tab.graph.width,
      start,
      commits,
      graph: tab.graph.rows(start, commits.length),
      workingTreeGraph: tab.graph.workingTreeRow,
      selectedIndex:
        scrollTo === undefined ? tab.index : tab.positions.get(scrollTo),
      anchor,
    });
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
      context.git.git.path,
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
    const gitPath = context.git.git.path;
    let files: readonly FileChange[];
    let workingTree: WorkingTree | undefined;
    if (hash === workingTreeHash) {
      workingTree =
        knownWorkingTree ?? (await workingTreeFiles(gitPath, context.root));
      files = workingTree.files;
    } else if (context.tab.positions.has(hash)) {
      files = await showFiles(gitPath, context.root, hash);
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
    const gitPath = context.git.git.path;
    if (hash !== workingTreeHash) {
      return showPatch(gitPath, context.root, hash, scope);
    }
    const workingTree =
      context.tab.workingTree ??
      (await workingTreeFiles(gitPath, context.root));
    return workingTreePatch(gitPath, context.root, workingTree, scope);
  }

  // A refresh doesn't send the files the page lists already
  private async sendTree(
    context: Context,
    hash: string,
    refreshing = false,
  ): Promise<void> {
    const paths = await listTree(
      context.git.git.path,
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
        context.git.git.path,
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

// The same folder, also spelled differently, like VS Code's "c:" drive letter
// next to the "C:" of a picked folder on Windows
function sameRoot(a: string, b: string): boolean {
  return path.relative(a, b) === '';
}

function uniqueRoots(roots: readonly string[]): string[] {
  return roots.filter(
    (root, index) =>
      roots.findIndex((other) => sameRoot(other, root)) === index,
  );
}

// Where the list keeps its place: the commit that was at its top, or the
// very top, above the working tree's row, when it was scrolled all the way
// up, where new commits show up; nothing for a commit no longer shown
function anchorOf(
  tab: TabState,
): { index: number; offset: number } | undefined {
  if (!tab.anchor) {
    return undefined;
  }
  if (tab.anchor.hash === workingTreeHash) {
    return { index: -1, offset: 0 };
  }
  const index = tab.positions.get(tab.anchor.hash);
  return index === undefined ? undefined : { index, offset: tab.anchor.offset };
}

// Keeps a message the tab replays, in place of the one before it
function keep(shown: Shown, message: ToWebview): void {
  switch (message.type) {
    case 'repository':
      shown.repository = message;
      break;
    case 'syncing':
      shown.syncing = message;
      break;
    case 'navigation':
      shown.navigation = message;
      break;
    case 'commits':
      shown.commits = message;
      break;
    case 'workingTree':
      shown.workingTree = message;
      break;
    case 'files':
      shown.files = message;
      break;
    case 'diff':
    case 'fileContent':
      shown.diff = message;
      break;
    case 'tree':
      shown.tree = message;
      break;
    default:
      break;
  }
}

// What the page is sent when the tab opens again, with the files before the
// diff, as when a commit is selected
function replayOf(tab: TabState): ToWebview[] {
  const { shown } = tab;
  return [
    shown.repository,
    shown.syncing,
    shown.navigation,
    // The list comes back where it was scrolled to, or else at the commit
    // selected since it was sent
    shown.commits && {
      ...shown.commits,
      selectedIndex: tab.index,
      anchor: anchorOf(tab),
    },
    shown.workingTree,
    shown.files,
    shown.diff,
    shown.tree,
  ].filter((message) => message !== undefined);
}

// Whether a step of the back and forward history can still be gone to: the
// uncommitted changes always can, a commit while the history has it
function stillThere(tab: TabState): (hash: string) => boolean {
  return (hash) => hash === workingTreeHash || tab.inHistory.has(hash);
}

// Remembers the subjects of commits sent to the page
function keepSubjects(tab: TabState, commits: readonly CommitInfo[]): void {
  for (const commit of commits) {
    tab.subjects.set(commit.hash, commit.subject);
  }
}

// Where a commit is in the list; the working tree's row is above the first
function positionOf(
  tab: TabState,
  hash: string | undefined,
): number | undefined {
  if (hash === workingTreeHash) {
    return -1;
  }
  return hash === undefined ? undefined : tab.positions.get(hash);
}

// The steps each way the history's dropdowns list
const navigationShown = 20;

// The full hash of a commit given by a short one, if there is one
async function commitOf(
  context: Context,
  prefix: string,
): Promise<string | undefined> {
  if (!/^[0-9a-f]{4,40}$/i.test(prefix)) {
    return undefined;
  }
  const output = await runGit(
    context.git.git.path,
    context.root,
    ['rev-parse', '--verify', '--quiet', `${prefix}^{commit}`],
    { okExitCodes: [0, 1, 128] },
  );
  return output.trim() || undefined;
}

// What git said about a failure: the Git extension's errors keep git's output
// in stderr, and their message is only "Failed to execute git"
function gitErrorText(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'stderr' in error) {
    const { stderr } = error;
    if (typeof stderr === 'string' && stderr.trim()) {
      return stderr.trim();
    }
  }
  return error instanceof Error ? error.message : String(error);
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
