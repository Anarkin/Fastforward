import * as vscode from 'vscode';

export const toggleViewCommand = 'fastforward.toggleView';
const viewType = 'fastforward.view';

export class FastforwardView implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;

  constructor(private readonly log: vscode.LogOutputChannel) {}

  // panel.active lags behind right after reveal or hide, the tab groups don't
  get isShown(): boolean {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    return (
      input instanceof vscode.TabInputWebview &&
      input.viewType.endsWith(viewType)
    );
  }

  async toggle(): Promise<void> {
    if (this.isShown) {
      await this.hide();
    } else {
      this.show();
    }
  }

  show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Active);
    } else {
      this.panel = this.createPanel();
    }
    this.log.info('View shown');
  }

  async hide(): Promise<void> {
    await vscode.commands.executeCommand(
      'workbench.action.openPreviousRecentlyUsedEditorInGroup',
    );
    this.log.info('View hidden');
  }

  dispose(): void {
    this.panel?.dispose();
  }

  private createPanel(): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(
      viewType,
      'Fastforward',
      vscode.ViewColumn.Active,
      { retainContextWhenHidden: true },
    );
    panel.webview.html = html(panel.webview);
    panel.onDidDispose(() => {
      this.panel = undefined;
    });
    return panel;
  }
}

function html(webview: vscode.Webview): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fastforward</title>
  <style>
    body {
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
    }
  </style>
</head>
<body>
  <h1>Fastforward</h1>
</body>
</html>`;
}
