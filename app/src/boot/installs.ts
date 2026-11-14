import { strings } from '../lib/shared/strings';
import type { Log } from '../shell/main/log';
import { addExplorerMenu, explorerMenuOf } from './explorerMenu';
import {
  commandFiles,
  pointCommandAt,
  refreshCommand,
  type CommandPlace,
} from './terminalCommand';

export function keepCommandPointed(
  log: Log,
  commandPlace: CommandPlace,
  whenAppImageMoves: (moved: (updated: string) => void) => void,
): void {
  void refreshCommand(commandPlace, commandFiles).then(
    (pointed) => {
      if (pointed) {
        log.info(strings.log.pointedCommand(commandPlace.path));
      }
    },
    (error: unknown) => {
      log.error(strings.log.pointingCommandFailed);
      log.error(error);
    },
  );
  whenAppImageMoves((updated) => {
    try {
      if (pointCommandAt(commandPlace, updated)) {
        log.info(strings.log.pointedCommandAtUpdate(commandPlace.path));
      }
    } catch (error) {
      log.error(strings.log.pointingCommandAtUpdateFailed);
      log.error(error);
    }
  });
}

export function keepExplorerMenu(log: Log): void {
  const explorerMenu = explorerMenuOf(process.platform, process.execPath);
  if (explorerMenu !== undefined) {
    void addExplorerMenu(explorerMenu).catch((error: unknown) => {
      log.error(strings.log.addingExplorerMenuFailed);
      log.error(error);
    });
  }
}
