import * as vscode from 'vscode';

export function registerCommand(
  log: vscode.LogOutputChannel,
  command: string,
  callback: () => unknown,
): vscode.Disposable {
  return vscode.commands.registerCommand(command, async () => {
    log.info(`Running ${command}`);
    try {
      await callback();
    } catch (error) {
      log.error(`${command} failed`);
      log.error(error instanceof Error ? error : String(error));
      void vscode.window.showErrorMessage(
        `Fastforward: ${command} failed, see the Fastforward output for details`,
      );
    }
  });
}
