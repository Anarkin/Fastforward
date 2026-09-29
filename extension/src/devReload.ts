import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

const devReloadMarker = '.dev-reload';

export function watchDevReload(
  context: vscode.ExtensionContext,
  log: vscode.LogOutputChannel,
): void {
  if (
    context.extensionMode !== vscode.ExtensionMode.Production ||
    !fs.existsSync(path.join(context.extensionPath, devReloadMarker))
  ) {
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
  watcher.on('error', (error) => {
    log.error('Watching for new builds failed');
    log.error(error);
  });
  context.subscriptions.push({
    dispose: () => {
      clearTimeout(timer);
      watcher.close();
    },
  });
}
