import * as path from 'node:path';
import type { Log } from './log';
import type { CommandInstall, CommandState } from './hostTypes';
import { strings } from '../../lib/shared/strings';
import type { Storage } from './storage';
import type { Notice, Page, ShellHost } from './shell';

function commandNotice(installed: CommandInstall): Notice | undefined {
  switch (installed.kind) {
    case 'installed':
      return {
        level: 'info',
        message: installed.onPath
          ? strings.messages.commandInstalled(installed.path)
          : strings.messages.commandOffPath(
              installed.path,
              path.posix.dirname(installed.path),
            ),
      };
    case 'alreadyInstalled':
      return {
        level: 'info',
        message: strings.messages.commandAlreadyInstalled(installed.path),
      };
    case 'taken':
      return {
        level: 'error',
        message: strings.messages.commandTaken(installed.path),
      };
    case 'notMoved':
      return { level: 'error', message: strings.messages.commandNotMoved };
    case 'cancelled':
      return undefined;
    default:
      return installed satisfies never;
  }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface CommandOfferHost {
  readonly shellHost: ShellHost;
  readonly storage: Storage;
  readonly log: Log;
  readonly notice: (page: Page | undefined, notice: Notice) => void;
  readonly save: (saving: Promise<void>) => void;
}

export class CommandOffer {
  constructor(private readonly host: CommandOfferHost) {}

  async offer(page: Page): Promise<void> {
    let state: CommandState;
    try {
      state = await this.host.shellHost.commandState();
    } catch (error) {
      this.host.log.error(strings.log.checkingCommandFailed);
      this.host.log.error(error instanceof Error ? error : String(error));
      return;
    }
    if (state !== 'missing' || this.host.storage.commandOffered) {
      return;
    }
    this.host.save(this.host.storage.setCommandOffered());
    this.host.notice(page, {
      level: 'info',
      message: strings.messages.offerCommand,
    });
  }

  async install(page: Page): Promise<void> {
    if (!this.host.shellHost.canInstallCommand()) {
      return;
    }
    let installed: CommandInstall;
    try {
      installed = await this.host.shellHost.installCommand();
    } catch (error) {
      this.host.log.error(strings.log.installingCommandFailed);
      this.host.log.error(error instanceof Error ? error : String(error));
      this.host.notice(page, {
        level: 'error',
        message: strings.messages.couldNotInstallCommand(reasonOf(error)),
      });
      return;
    }
    const notice = commandNotice(installed);
    if (notice) {
      this.host.notice(page, notice);
    }
  }
}
