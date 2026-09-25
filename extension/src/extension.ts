import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('fastforward.helloWorld', () => {
      vscode.window.showInformationMessage('Hello from Fastforward');
    }),
  );
}

export function deactivate(): void {}
