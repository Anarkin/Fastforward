import * as vscode from 'vscode';
import { watchDevReload } from './devReload';
import { registerCommand } from './registerCommand';
import {
  FastforwardView,
  showViewCommand,
  toggleViewCommand,
  viewTitle,
  viewType,
} from './view';

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('Fastforward', { log: true });
  context.subscriptions.push(log);
  log.info(`Activated ${context.extension.id}`);
  watchDevReload(context, log);

  const view = new FastforwardView(
    log,
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
