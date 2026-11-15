import * as fs from 'node:fs';
import * as path from 'node:path';
import { app, clipboard } from 'electron';
import type { ShellHost } from '../shell/main/shell';
import type { UserSettings } from '../shell/main/userSettings';
import type { Sentence } from '../lib/shared/sentences';
import type { GitLocator } from '../tools/git/main/gitLocator';
import { writeReadOnly } from './readOnlyFile';
import type { AppWindows } from './appWindows';
import type { QuitGuard } from './quitGuard';
import type { Updates } from './updates';
import { tearsOffTabs } from './tabDrag';
import {
  fileSystemFor,
  type LocalFileSystem,
} from '../tools/commander/main/fileSystem';
import { partLooksOf } from '../tools/commander/main/partLooks';
import {
  commandFiles,
  commandState,
  installCommand,
  linkAsAdmin,
  type CommandPlace,
} from './terminalCommand';

export interface ShellHostDeps {
  readonly dist: string;
  readonly development: boolean;
  readonly userSettingsFile: string;
  readonly defaultSettingsCopy: string;
  readonly userSettings: UserSettings;
  readonly untoldStateProblems: Sentence[];
  readonly updates: Updates;
  readonly quitGuard: QuitGuard;
  readonly git: GitLocator;
  readonly system: string;
  readonly commandPlace: CommandPlace | undefined;
  readonly windows: AppWindows;
}

export function shellHostOf({
  dist,
  development,
  userSettingsFile,
  defaultSettingsCopy,
  userSettings,
  untoldStateProblems,
  updates,
  quitGuard,
  git,
  system,
  commandPlace,
  windows,
}: ShellHostDeps): ShellHost {
  let looking: Promise<LocalFileSystem> | undefined;
  return {
    userSettingsFile: async () => {
      if (!fs.existsSync(userSettingsFile)) {
        await fs.promises.writeFile(userSettingsFile, '{}\n');
      }
      return userSettingsFile;
    },
    defaultSettingsFile: () => {
      writeReadOnly(
        defaultSettingsCopy,
        fs.readFileSync(path.join(dist, 'settings.json'), 'utf8'),
      );
      return Promise.resolve(defaultSettingsCopy);
    },
    settingsProblems: () => userSettings.problems,
    stateProblems: () => untoldStateProblems.splice(0),
    checkForUpdates: () => updates.check(true),
    installUpdate: () => {
      if (
        updates.status.kind !== 'ready' ||
        !quitGuard.holds(() => updates.install())
      ) {
        updates.install();
      }
    },
    quit: () => quitGuard.confirmed(),
    updateStatus: () => updates.status,
    about: () => ({
      version: app.getVersion(),
      development,
      ...(git.git.kind === 'found' && { git: git.git.version }),
      system,
    }),
    copyText: (text) => {
      void clipboard.writeText(text);
    },
    canInstallCommand: () => commandPlace !== undefined,
    commandState: () =>
      commandPlace === undefined
        ? Promise.resolve('taken')
        : commandState(commandPlace, commandFiles),
    installCommand: () =>
      commandPlace === undefined
        ? Promise.resolve({ kind: 'cancelled' })
        : installCommand(
            commandPlace,
            commandFiles,
            linkAsAdmin(),
            (process.env.PATH ?? '').split(path.delimiter),
          ),
    openWindow: (id, near) => windows.openNear(id, near),
    closeWindow: (id) => windows.close(id),
    showWindow: (id) => windows.show(id),
    tearsOff: () => tearsOffTabs(process.platform, process.env),
    drag: (window, event) => windows.dragged(window, event),
    partLooks: async (paths) => {
      looking ??= fileSystemFor(process.platform);
      const files = await looking;
      return partLooksOf(
        paths,
        {
          hidden: (file) => files.hidden(file),
          stat: (file) => fs.promises.stat(file).catch(() => undefined),
        },
        process.platform,
      );
    },
  };
}
