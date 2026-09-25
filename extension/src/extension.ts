import * as vscode from 'vscode';
import { registerCommand } from './registerCommand';

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('Fastforward', { log: true });
  context.subscriptions.push(log);
  log.info(`Activated ${context.extension.id}`);

  context.subscriptions.push(
    registerCommand(log, 'fastforward.helloWorld', () => {
      void vscode.window.showInformationMessage('Hello from Fastforward');
    }),
  );
}

export function deactivate(): void {}
