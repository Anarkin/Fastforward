import * as fs from 'node:fs';
import * as vscode from 'vscode';

export const devReloadMarker = '.dev-reload';

// npm run deploy-local touches the marker in the installed extension after
// copying a new build, and this restarts the extension host to load it
export function watchDevReload(
  context: vscode.ExtensionContext,
  log: vscode.LogOutputChannel,
): void {
  if (context.extensionMode !== vscode.ExtensionMode.Production) {
    return;
  }
  let timer: NodeJS.Timeout | undefined;
  const watcher = fs.watch(context.extensionPath, (_event, filename) => {
    if (filename !== devReloadMarker) {
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      log.info('New build deployed, restarting the extension host');
      void vscode.commands.executeCommand(
        'workbench.action.restartExtensionHost',
      );
    }, 200);
  });
  context.subscriptions.push({
    dispose: () => {
      clearTimeout(timer);
      watcher.close();
    },
  });
}
