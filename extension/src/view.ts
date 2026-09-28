import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { API, Repository } from './git/git';
import { Graph } from './git/graph';
import {
  checkedOutBranch,
  countRefs,
  decorations as refDecorations,
  defaultVips,
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
} from './git/show';
import {
  isLargeChange,
  workingTreeHash,
  type CheckoutTarget,
  type SyncAction,
  type FileChange,
  type RefInfo,
  type ChangesView,
  type FilesMode,
  type ToExtension,
  type ToWebview,
  type Vip,
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

// The first page of commits, sent with the history's size; the webview asks
// for the rest as they scroll into view
const firstPageSize = 100;

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
// VIP refs by repository root, per user; not synced, as roots are paths on
// this machine
const vipsKey = 'vips';

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
  // Every commit of every branch, remote and tag, newest first
  fullHistory: readonly HistoryEntry[];
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
  // The commits refs point at, which are always shown, and how many refs
  // point at each
  refCounts: Map<string, number>;
  // Merges the user expanded or collapsed, unlike the setting says
  toggledMerges: Set<string>;
  // The commits shown, with merges collapsed or expanded, and each commit's
  // position in it; pages and jumps are looked up here
  history: readonly ShownEntry[];
  positions: Map<string, number>;
  // The lanes of the history, laid out when it loads
  graph: Graph;
  // The last message of each type sent for this tab, replayed when the tab
  // or the modal opens again so it shows up instantly, before the refresh
  shown: Map<ToWebview['type'], ToWebview>;
  // The refresh that is running, and whether another change came in during
  // it, which runs it once more instead of in parallel
  refreshing: Promise<void> | undefined;
  refreshAgain: boolean;
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
  // Drops messages once the user switched to another tab
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

  private get tabs(): string[] {
    return this.workspaceState.get<string[]>(tabsKey, []);
  }

  private get activeTab(): string | undefined {
    return this.workspaceState.get<string>(activeTabKey);
  }

  private async setTabs(tabs: string[], active: string | undefined) {
    await this.workspaceState.update(tabsKey, tabs);
    await this.workspaceState.update(activeTabKey, active);
  }

  private get recent(): string[] {
    return this.globalState.get<string[]>(recentKey, []);
  }

  private async addRecent(root: string): Promise<void> {
    const recent = [root, ...this.recent.filter((r) => r !== root)];
    await this.globalState.update(recentKey, recent.slice(0, maxRecent));
  }

  private async removeRecent(root: string): Promise<void> {
    await this.globalState.update(
      recentKey,
      this.recent.filter((r) => r !== root),
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
        const added = roots.filter((root) => !this.tabs.includes(root));
        await this.setTabs([...this.tabs, ...new Set(added)], this.activeTab);
        const last = roots.at(-1);
        if (last) {
          await this.openTab(git, session, last);
        }
        return;
      }
      case 'closeTab': {
        const index = this.tabs.indexOf(message.root);
        const tabs = this.tabs.filter((tab) => tab !== message.root);
        this.tabStates.delete(message.root);
        const active =
          this.activeTab === message.root
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
      case 'setVips': {
        const root = this.activeTab;
        if (root) {
          await this.setVips(root, message.vips);
        }
        return;
      }
    }

    const context = await this.context(git, session);
    if (!context) {
      return;
    }
    switch (message.type) {
      case 'loadCommits':
        await this.sendCommitPage(context, message.start, message.count);
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
      case 'scrolled':
        context.tab.anchor = { hash: message.hash, offset: message.offset };
        break;
      case 'loadTree':
        await this.sendTree(context, message.hash);
        break;
      case 'setCollapseMerges':
        await this.globalState.update(collapseMergesKey, message.collapse);
        // The setting applies to every merge again
        for (const tab of this.tabStates.values()) {
          tab.toggledMerges.clear();
          // Reloaded with the setting when it's shown again
          tab.fingerprint = '';
        }
        await this.sendShownHistory(context, undefined);
        break;
      case 'jump':
        await this.showCommit(context, message.hash);
        break;
      case 'selectCommit':
        context.tab.hash = message.hash;
        context.tab.index = message.index;
        context.tab.path = undefined;
        // Nothing selected shows no files or diff when the view reopens
        if (!message.hash) {
          context.tab.shown.delete('files');
          context.tab.shown.delete('diff');
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
    if (root && !this.tabs.includes(root)) {
      await this.setTabs([root, ...this.tabs], this.activeTab ?? root);
    }
  }

  // Offers recent repositories first, and the folder picker as the last item
  private async pickRepositories(git: API): Promise<string[]> {
    const recent = this.recent.filter((root) => !this.tabs.includes(root));
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
    const active = root && this.tabs.includes(root) ? root : this.tabs[0];
    await this.setTabs(this.tabs, active);
    this.postTabs(session);
    if (active) {
      const tab = this.tabState(active);
      await tab.preloading;
      // The list comes back where it was scrolled to, or else at the commit
      // selected since it was sent
      const anchorIndex =
        tab.anchor === undefined
          ? undefined
          : tab.positions.get(tab.anchor.hash);
      for (const message of tab.shown.values()) {
        session.post(
          message.type === 'commits'
            ? {
                ...message,
                selectedIndex: tab.index,
                anchor:
                  tab.anchor === undefined || anchorIndex === undefined
                    ? undefined
                    : { index: anchorIndex, offset: tab.anchor.offset },
              }
            : message,
        );
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
    await this.addDefaultVips(context);
    // The first time a tab opens it starts at what is checked out; later, it
    // is where it was left
    const firstOpen = !context.tab.opened;
    context.tab.opened = true;
    // Coming back, the page shows the tab as it was left, and only what
    // changed since is sent, like after a change in the repository, instead
    // of reloading a history that took half a second for 190k commits
    if (!firstOpen && context.tab.shown.has('commits')) {
      this.log.info(`Tab ${context.root} is shown as it was left`);
      await this.refresh(context);
      return;
    }
    await Promise.all([
      this.sendCommits(context).then(() =>
        firstOpen ? this.showHead(context) : this.sendCommit(context),
      ),
      this.sendWorkingTree(context),
      this.sendRepository(context),
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
        const context = await this.context(git, session, root);
        if (!context || tab.opened) {
          return;
        }
        this.log.info(`Preloading tab ${root}`);
        tab.opened = true;
        await this.addDefaultVips(context);
        await Promise.all([
          this.sendCommits(context).then(() => this.showHead(context)),
          this.sendWorkingTree(context),
          this.sendRepository(context),
        ]);
      } catch (error) {
        // Opening the tab loads it the usual way then
        tab.opened = false;
        tab.shown.clear();
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
    knownRefs?: readonly RefInfo[],
  ): Promise<void> {
    const [refs, counts] = await Promise.all([
      knownRefs ?? listRefs(context.repository),
      aheadBehind(context.git.git.path, context.root),
    ]);
    context.post({
      type: 'repository',
      head: checkedOutBranch(context.repository.state.HEAD),
      headCommit: context.repository.state.HEAD?.commit,
      headUpstream: upstreamOf(context.repository),
      ...counts,
      refs,
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
      type: 'vips',
      vips: active ? (this.vipsOf(active) ?? []) : [],
    });
  }

  // Undefined for a repository that never had VIPs saved
  private vipsOf(root: string): readonly Vip[] | undefined {
    return this.globalState.get<Record<string, Vip[]>>(vipsKey, {})[root];
  }

  // The first time a repository opens, its main branch becomes a VIP: the
  // remote's default branch, or else a local main, master or trunk, with the
  // local and remote branch of the same name; removing them later sticks, as
  // the repository has a saved list from then on
  private async addDefaultVips(context: Context): Promise<void> {
    if (this.vipsOf(context.root) !== undefined) {
      return;
    }
    const [refs, defaults] = await Promise.all([
      listRefs(context.repository),
      remoteDefaultBranches(context.git.git.path, context.root),
    ]);
    const vips = defaultVips(refs, defaults);
    await this.setVips(context.root, vips);
    context.post({ type: 'vips', vips });
  }

  private async setVips(root: string, vips: readonly Vip[]): Promise<void> {
    const all = this.globalState.get<Record<string, readonly Vip[]>>(
      vipsKey,
      {},
    );
    await this.globalState.update(vipsKey, { ...all, [root]: vips });
  }

  private tabState(root: string): TabState {
    let tab = this.tabStates.get(root);
    if (!tab) {
      tab = {
        hash: undefined,
        index: undefined,
        path: undefined,
        changedFiles: new Map(),
        fullHistory: [],
        heads: new Set(),
        fingerprint: '',
        anchor: undefined,
        opened: false,
        refCounts: new Map(),
        toggledMerges: new Set(),
        history: [],
        positions: new Map(),
        graph: new Graph([]),
        shown: new Map(),
        refreshing: undefined,
        preloading: undefined,
        refreshAgain: false,
      };
      this.tabStates.set(root, tab);
    }
    return tab;
  }

  private async context(
    git: API,
    session: Session,
    root = this.activeTab,
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
      if (this.activeTab === root) {
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
        // Pages aren't replayed, as the webview asks for the ones on screen,
        // and neither are jumps and errors, which happen once
        if (
          message.type !== 'commitPage' &&
          message.type !== 'reveal' &&
          message.type !== 'error' &&
          message.type !== 'fileDiff'
        ) {
          tab.shown.set(message.type, message);
        }
        if (this.activeTab === root) {
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
      } else {
        await repository.push();
      }
      this.log.info(
        `${action === 'pull' ? 'Pulled' : 'Pushed'} ${repository.state.HEAD?.name ?? ''}`,
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
  private async showCommit(context: Context, hash: string): Promise<void> {
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
  // ref, keeping the list's place
  private refresh(context: Context): Promise<void> {
    const { tab } = context;
    if (tab.refreshing) {
      tab.refreshAgain = true;
      return tab.refreshing;
    }
    tab.refreshing = (async () => {
      try {
        do {
          tab.refreshAgain = false;
          await this.refreshOnce(context);
        } while (tab.refreshAgain);
      } finally {
        tab.refreshing = undefined;
      }
    })();
    return tab.refreshing;
  }

  private async refreshOnce(context: Context): Promise<void> {
    const files = await workingTreeFiles(context.git.git.path, context.root);
    context.post({ type: 'workingTree', files: files.length });
    if (context.tab.hash === workingTreeHash) {
      await this.sendCommit(context, files);
      const tree = context.tab.shown.get('tree');
      if (tree?.type === 'tree' && tree.hash === workingTreeHash) {
        await this.sendTree(context, workingTreeHash);
      }
    }
    const refs = await listRefs(context.repository);
    if (
      fingerprint(context.repository.state.HEAD, refs) !==
      context.tab.fingerprint
    ) {
      this.log.info('Refs changed, reloading the history');
      await Promise.all([
        this.sendRepository(context, refs),
        this.sendCommits(context, true, refs),
      ]);
    }
  }

  private async sendWorkingTree(context: Context): Promise<void> {
    const files = await workingTreeFiles(context.git.git.path, context.root);
    context.post({ type: 'workingTree', files: files.length });
  }

  private async sendCommits(
    context: Context,
    keepPlace = false,
    knownRefs?: readonly RefInfo[],
  ): Promise<void> {
    const [fullHistory, refs] = await Promise.all([
      listHistory(context.git.git.path, context.root),
      knownRefs ?? listRefs(context.repository),
    ]);
    const { tab } = context;
    tab.fullHistory = fullHistory;
    tab.heads = headsOf(fullHistory);
    tab.fingerprint = fingerprint(context.repository.state.HEAD, refs);
    tab.refCounts = countRefs(refs, context.repository.state.HEAD);
    await this.sendShownHistory(context, undefined, keepPlace);
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
    tab.graph = new Graph(history, { head });
    this.log.info(
      `Graph of ${history.length} of ${tab.fullHistory.length} commits laid out in ${Math.round(performance.now() - started)} ms, ${tab.graph.width} lanes wide`,
    );
    // The selected commit may have moved, or be hidden in a collapsed merge
    tab.index =
      tab.hash === undefined ? undefined : tab.positions.get(tab.hash);
    const decorations = refDecorations(tab.refCounts, tab.positions);
    // The page the list shows first: the top, or around the commit that stays
    // in place, so the list doesn't flash placeholders there
    const anchorIndex =
      keepPlace && tab.anchor ? tab.positions.get(tab.anchor.hash) : undefined;
    const start =
      anchorIndex === undefined
        ? 0
        : anchorIndex - (anchorIndex % firstPageSize);
    const commits = await logCommits(
      context.git.git.path,
      context.root,
      history
        .slice(start, start + 2 * firstPageSize)
        .map((entry) => entry.hash),
    );
    context.post({
      type: 'commits',
      total: history.length,
      decorations,
      graphWidth: tab.graph.width,
      start,
      commits,
      graph: tab.graph.rows(start, commits.length),
      workingTreeGraph: tab.graph.workingTreeRow,
      selectedIndex:
        scrollTo === undefined ? tab.index : tab.positions.get(scrollTo),
      anchor:
        anchorIndex === undefined || !tab.anchor
          ? undefined
          : { index: anchorIndex, offset: tab.anchor.offset },
    });
  }

  private async sendCommitPage(
    context: Context,
    start: number,
    count: number,
  ): Promise<void> {
    const { history, graph } = context.tab;
    const commits = await logCommits(
      context.git.git.path,
      context.root,
      history.slice(start, start + count).map((entry) => entry.hash),
    );
    // The history was reloaded while this page loaded
    if (context.tab.history !== history) {
      return;
    }
    context.post({
      type: 'commitPage',
      start,
      commits,
      graph: graph.rows(start, commits.length),
    });
  }

  private async sendCommit(
    context: Context,
    workingTreeFilesKnown?: FileChange[],
  ): Promise<void> {
    const { hash } = context.tab;
    if (!hash) {
      return;
    }
    const gitPath = context.git.git.path;
    let files: FileChange[];
    if (hash === workingTreeHash) {
      files =
        workingTreeFilesKnown ??
        (await workingTreeFiles(gitPath, context.root));
    } else if (context.tab.positions.has(hash)) {
      files = await showFiles(gitPath, context.root, hash);
    } else {
      return;
    }
    // Another commit was selected while git ran
    if (context.tab.hash !== hash) {
      return;
    }
    context.tab.changedFiles = new Map(files.map((file) => [file.path, file]));
    // A refresh doesn't send what the page shows already; a selection always
    // sends, as the page cleared its files and diff when it asked
    const refreshing = workingTreeFilesKnown !== undefined;
    const shownFiles = context.tab.shown.get('files');
    const unchanged =
      shownFiles?.type === 'files' &&
      shownFiles.hash === hash &&
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
    const scope = { path: file, oldPath: change?.oldPath };
    const patch =
      hash === workingTreeHash
        ? await workingTreePatch(context.git.git.path, context.root, scope)
        : await showPatch(context.git.git.path, context.root, hash, scope);
    if (context.tab.hash === hash) {
      context.post({ type: 'fileDiff', hash, path: file, patch });
    }
  }

  private async sendTree(context: Context, hash: string): Promise<void> {
    const paths = await listTree(
      context.git.git.path,
      context.root,
      hash === workingTreeHash ? undefined : hash,
    );
    context.post({ type: 'tree', hash, paths });
  }

  private async sendDiff(
    context: Context,
    hash: string,
    refreshing = false,
  ): Promise<void> {
    const { path: file } = context.tab;
    const gitPath = context.git.git.path;
    // Another commit or file was selected while git ran
    const stale = () => context.tab.hash !== hash || context.tab.path !== file;
    const change =
      file === undefined ? undefined : context.tab.changedFiles.get(file);
    // A file the commit didn't change, picked in the Files view, has no diff
    if (file !== undefined && !change) {
      const { content, binary } = await readFile(
        gitPath,
        context.root,
        hash === workingTreeHash ? undefined : hash,
        file,
      );
      if (!stale()) {
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
    const patch =
      hash === workingTreeHash
        ? await workingTreePatch(gitPath, context.root, scope)
        : await showPatch(gitPath, context.root, hash, scope);
    const shownDiff = context.tab.shown.get('diff');
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
