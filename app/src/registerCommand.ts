import * as vscode from 'vscode';

export function registerCommand(
  log: vscode.LogOutputChannel,
  command: string,
  callback: (...args: unknown[]) => unknown,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    command,
    async (...args: unknown[]) => {
      log.info(`Running ${command}`);
      try {
        await callback(...args);
      } catch (error) {
        log.error(`${command} failed`);
        log.error(error instanceof Error ? error : String(error));
        void vscode.window.showErrorMessage(
          `Fastforward: ${command} failed, see the Fastforward output for details`,
        );
      }
    },
  );
}
