import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { API, Repository } from './git/git';
import {
  getGitApi,
  listCommits,
  listRefs,
  pickRepository,
  repositoryName,
} from './git/repository';
import {
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

// Kept in the extension, because the webview is recreated every time the modal
// opens
interface Selection {
  ref: string | undefined;
  hash: string | undefined;
  path: string | undefined;
}

// One per open webview
interface Session {
  readonly post: (message: ToWebview) => void;
  watcher: vscode.Disposable | undefined;
}

interface Context {
  readonly git: API;
  readonly repository: Repository;
  readonly post: (message: ToWebview) => void;
}

export class FastforwardView
  implements vscode.CustomReadonlyEditorProvider, vscode.Disposable
{
  private readonly registration: vscode.Disposable;
  private readonly selection: Selection = {
    ref: undefined,
    hash: undefined,
    path: undefined,
  };
  private commits = new Map<string, CommitInfo>();

  constructor(
    private readonly log: vscode.LogOutputChannel,
    private readonly extensionUri: vscode.Uri,
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
    const repository = pickRepository(git);
    if (!repository) {
      session.post({ type: 'error', message: 'No git repository is open' });
      return;
    }
    const context: Context = { git, repository, post: session.post };
    switch (message.type) {
      case 'ready':
        this.watch(context, session);
        session.post({
          type: 'repository',
          name: repositoryName(repository),
          head: repository.state.HEAD?.name,
          refs: await listRefs(repository),
        });
        await Promise.all([
          this.sendWorkingTree(context),
          this.sendCommits(context),
        ]);
        await this.sendCommit(context);
        break;
      case 'selectRef':
        this.selection.ref = message.ref;
        await this.sendCommits(context);
        break;
      case 'selectCommit':
        this.selection.hash = message.hash;
        this.selection.path = undefined;
        await this.sendCommit(context);
        break;
      case 'selectFile':
        this.selection.path = message.path;
        await this.sendDiff(context, message.hash);
        break;
    }
  }

  // Keeps the uncommitted changes row up to date while the view is open
  private watch(context: Context, session: Session): void {
    session.watcher?.dispose();
    let timer: NodeJS.Timeout | undefined;
    const subscription = context.repository.state.onDidChange(() => {
      clearTimeout(timer);
      timer = setTimeout(
        () =>
          void this.run('refresh', session, async () => {
            await this.sendWorkingTree(context);
            if (this.selection.hash === workingTreeHash) {
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
    const files = await workingTreeFiles(
      context.git.git.path,
      context.repository.rootUri.fsPath,
    );
    context.post({ type: 'workingTree', files: files.length });
  }

  private async sendCommits(context: Context): Promise<void> {
    const { ref } = this.selection;
    const commits = await listCommits(context.repository, ref);
    this.commits = new Map(commits.map((commit) => [commit.hash, commit]));
    context.post({ type: 'commits', ref, commits });
  }

  private async sendCommit(context: Context): Promise<void> {
    const { hash } = this.selection;
    if (!hash) {
      return;
    }
    const gitPath = context.git.git.path;
    const cwd = context.repository.rootUri.fsPath;
    if (hash === workingTreeHash) {
      const files = await workingTreeFiles(gitPath, cwd);
      context.post({ type: 'files', hash, files });
    } else if (this.commits.has(hash)) {
      const files = await showFiles(gitPath, cwd, hash);
      context.post({ type: 'files', hash, files });
    } else {
      return;
    }
    await this.sendDiff(context, hash);
  }

  private async sendDiff(context: Context, hash: string): Promise<void> {
    const { path } = this.selection;
    const gitPath = context.git.git.path;
    const cwd = context.repository.rootUri.fsPath;
    const patch =
      hash === workingTreeHash
        ? await workingTreePatch(gitPath, cwd, path)
        : await showPatch(gitPath, cwd, hash, path);
    context.post({ type: 'diff', hash, path, patch });
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
