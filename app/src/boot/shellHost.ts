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
import { pathFactsOf } from '../tools/commander/main/pathFacts';
import { inRepository } from '../tools/commander/main/repositories';
import type { GitTool } from '../tools/git/main/tool';
import { shellMenuIn } from './shellMenu';
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
  readonly gitTool: Pick<GitTool, 'cloneInto' | 'initRepositoryIn'>;
  readonly editRefusal: (file: string) => Promise<Sentence | undefined>;
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
  gitTool,
  editRefusal,
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
    pathFacts: (file) =>
      pathFactsOf(
        file,
        {
          stat: (at) => fs.promises.stat(at).catch(() => undefined),
          inRepository: (folder) => inRepository(folder),
          gitMissing: () => git.path === undefined,
        },
        process.platform,
      ),
    editRefusal: (file) => editRefusal(file),
    cloneInto: (folder) => gitTool.cloneInto(folder),
    initRepository: (folder) => gitTool.initRepositoryIn(folder),
    ...(process.platform === 'win32' && { shellMenu: shellMenuIn(windows) }),
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
