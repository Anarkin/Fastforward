import * as vscode from 'vscode';
import { watchDevReload } from './devReload';
import { registerCommand } from './registerCommand';
import { FastforwardView, toggleViewCommand } from './view';

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('Fastforward', { log: true });
  context.subscriptions.push(log);
  log.info(`Activated ${context.extension.id}`);
  watchDevReload(context, log);

  const view = new FastforwardView(log);
  context.subscriptions.push(view);
  context.subscriptions.push(
    registerCommand(log, toggleViewCommand, () => view.toggle()),
  );

  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
  );
  statusBarItem.text = '$(fast-forward) Fastforward';
  statusBarItem.tooltip = 'Toggle the Fastforward view';
  statusBarItem.command = toggleViewCommand;
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
}

export function deactivate(): void {}
