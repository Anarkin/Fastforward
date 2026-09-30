import * as vscode from 'vscode';
import { watchDevReload } from './devReload';
import { findGit, minimumGitVersion } from './git/locate';
import { registerCommand } from './registerCommand';
import {
  FastforwardView,
  showViewCommand,
  toggleViewCommand,
  viewTitle,
  viewType,
} from './view';

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const log = vscode.window.createOutputChannel('Fastforward', { log: true });
  context.subscriptions.push(log);
  log.info(`Activated ${context.extension.id}`);
  watchDevReload(context, log);

  const git = await findGit();
  if (git.kind !== 'found') {
    log.error(
      `Git ${git.kind === 'missing' ? 'is missing' : `${git.version} is too old`}`,
    );
    void vscode.window.showErrorMessage(
      `Fastforward: needs git ${minimumGitVersion.join('.')} or later on the PATH`,
    );
    return;
  }
  log.info(`Using git ${git.version} at ${git.path}`);
  const view = new FastforwardView(
    log,
    git.path,
    context.extensionUri,
    context.workspaceState,
    context.globalState,
  );
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(viewType, view),
    registerCommand(log, toggleViewCommand, () => view.toggle()),
    registerCommand(log, showViewCommand, () => view.show()),
  );

  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
  );
  statusBarItem.text = viewTitle;
  statusBarItem.tooltip = 'Show the Fastforward view';
  statusBarItem.command = showViewCommand;
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
}
