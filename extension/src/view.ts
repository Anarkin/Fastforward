import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { API, Repository } from './git/git';
import { getGitApi, listRefs, pickRepository } from './git/repository';
import {
  logCommits,
  showFiles,
  showPatch,
  workingTreeFiles,
  workingTreePatch,
} from './git/show';
import {
  workingTreeHash,
  type CommitInfo,
  type ToExtension,
  type ToWebview,
} from './protocol';

export const toggleViewCommand = 'fastforward.toggleView';
export const showViewCommand = 'fastforward.showView';
const viewType = 'fastforward.view';
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

// Kept in the extension, because the webview is recreated every time the modal
// opens
interface TabState {
  ref: string | undefined;
  hash: string | undefined;
  path: string | undefined;
  commits: Map<string, CommitInfo>;
  // The last message of each type sent for this tab, replayed when the tab
  // or the modal opens again so it shows up instantly, before the refresh
  shown: Map<ToWebview['type'], ToWebview>;
}

// One per open webview
interface Session {
  readonly post: (message: ToWebview) => void;
  watcher: vscode.Disposable | undefined;
}

interface Context {
  readonly git: API;
  readonly repository: Repository;
  readonly root: string;
  readonly tab: TabState;
  // Drops messages once the user switched to another tab
  readonly post: (message: ToWebview) => void;
}

export class FastforwardView
  implements vscode.CustomReadonlyEditorProvider, vscode.Disposable
{
  private readonly registration: vscode.Disposable;
  private readonly tabStates = new Map<string, TabState>();

  constructor(
    private readonly log: vscode.LogOutputChannel,
    private readonly extensionUri: vscode.Uri,
    private readonly workspaceState: vscode.Memento,
    private readonly globalState: vscode.Memento,
  ) {
    this.registration = vscode.window.registerCustomEditorProvider(
      viewType,
      this,
    );
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
    const session: Session = {
      post: (message) => void panel.webview.postMessage(message),
      watcher: undefined,
    };
    panel.webview.onDidReceiveMessage((message: ToExtension) =>
      this.run(message.type, session, () => this.handle(message, session)),
    );
    panel.onDidDispose(() => session.watcher?.dispose());
  }

  dispose(): void {
    this.registration.dispose();
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
    }

    const context = await this.context(git, session);
    if (!context) {
      return;
    }
    switch (message.type) {
      case 'selectRef':
        context.tab.ref = message.ref;
        await this.sendCommits(context);
        break;
      case 'selectCommit':
        context.tab.hash = message.hash;
        context.tab.path = undefined;
        await this.sendCommit(context);
        break;
      case 'selectFile':
        context.tab.path = message.path;
        await this.sendDiff(context, message.hash);
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
    session.post({
      type: 'tabs',
      tabs: this.tabs.map((tab) => ({ root: tab, name: path.basename(tab) })),
      active,
    });
    if (active) {
      for (const message of this.tabState(active).shown.values()) {
        session.post(message);
      }
    }
    session.watcher?.dispose();
    session.watcher = undefined;
    const context = await this.context(git, session);
    if (!context) {
      return;
    }
    this.watch(context, session);
    await this.addRecent(context.root);
    await Promise.all([
      this.sendCommits(context).then(() => this.sendCommit(context)),
      this.sendWorkingTree(context),
      this.sendRepository(context),
    ]);
  }

  private async sendRepository(context: Context): Promise<void> {
    context.post({
      type: 'repository',
      head: context.repository.state.HEAD?.name,
      refs: await listRefs(context.repository),
    });
  }

  private tabState(root: string): TabState {
    let tab = this.tabStates.get(root);
    if (!tab) {
      tab = {
        ref: undefined,
        hash: undefined,
        path: undefined,
        commits: new Map(),
        shown: new Map(),
      };
      this.tabStates.set(root, tab);
    }
    return tab;
  }

  private async context(
    git: API,
    session: Session,
  ): Promise<Context | undefined> {
    const root = this.activeTab;
    if (!root) {
      return undefined;
    }
    // Repositories outside the workspace have to be opened first, which also
    // shows them in the Source Control view
    const uri = vscode.Uri.file(root);
    const repository =
      git.getRepository(uri) ?? (await git.openRepository(uri));
    if (!repository) {
      session.post({
        type: 'error',
        message: `${root} is not a git repository`,
      });
      return undefined;
    }
    const tab = this.tabState(root);
    return {
      git,
      repository,
      root,
      tab,
      post: (message) => {
        tab.shown.set(message.type, message);
        if (this.activeTab === root) {
          session.post(message);
        }
      },
    };
  }

  // Keeps the uncommitted changes row up to date while the view is open
  private watch(context: Context, session: Session): void {
    let timer: NodeJS.Timeout | undefined;
    const subscription = context.repository.state.onDidChange(() => {
      clearTimeout(timer);
      timer = setTimeout(
        () =>
          void this.run('refresh', session, async () => {
            await this.sendWorkingTree(context);
            if (context.tab.hash === workingTreeHash) {
              await this.sendCommit(context);
            }
          }),
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

  private async sendWorkingTree(context: Context): Promise<void> {
    const files = await workingTreeFiles(context.git.git.path, context.root);
    context.post({ type: 'workingTree', files: files.length });
  }

  private async sendCommits(context: Context): Promise<void> {
    const { ref } = context.tab;
    const commits = await logCommits(context.git.git.path, context.root, ref);
    context.tab.commits = new Map(
      commits.map((commit) => [commit.hash, commit]),
    );
    context.post({ type: 'commits', ref, commits });
  }

  private async sendCommit(context: Context): Promise<void> {
    const { hash } = context.tab;
    if (!hash) {
      return;
    }
    const gitPath = context.git.git.path;
    if (hash === workingTreeHash) {
      const files = await workingTreeFiles(gitPath, context.root);
      context.post({ type: 'files', hash, files });
    } else if (context.tab.commits.has(hash)) {
      const files = await showFiles(gitPath, context.root, hash);
      context.post({ type: 'files', hash, files });
    } else {
      return;
    }
    await this.sendDiff(context, hash);
  }

  private async sendDiff(context: Context, hash: string): Promise<void> {
    const { path: file } = context.tab;
    const gitPath = context.git.git.path;
    const patch =
      hash === workingTreeHash
        ? await workingTreePatch(gitPath, context.root, file)
        : await showPatch(gitPath, context.root, hash, file);
    context.post({ type: 'diff', hash, path: file, patch });
  }
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
