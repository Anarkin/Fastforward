import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { app } from 'electron';
import type { Log } from '../shell/main/log';
import { strings } from '../lib/shared/strings';
import type { UserSettings } from '../shell/main/userSettings';
import type { JsonFileStore } from '../shell/main/stateFile';
import { toolState } from '../shell/main/storage';
import { isFolder } from '../tools/git/main/folders';
import { hostProcess } from '../tools/terminal/main/hostProcess';
import { writeShellIntegration } from '../tools/terminal/main/shellIntegration';
import { isProgram, shellLaunch } from '../tools/terminal/main/shellLaunch';
import { windowsPtyOf } from '../tools/terminal/main/windowsPty';
import { TerminalTool } from '../tools/terminal/main/tool';

export interface TerminalHostDeps {
  readonly log: Log;
  readonly dist: string;
  readonly profile: string;
  readonly userSettings: UserSettings;
  readonly state: JsonFileStore;
  readonly chooseFolders: (
    options: Electron.OpenDialogOptions,
  ) => Promise<Electron.OpenDialogReturnValue>;
}

export function terminalToolOf({
  log,
  dist,
  profile,
  userSettings,
  state,
  chooseFolders,
}: TerminalHostDeps): TerminalTool {
  const terminalSettings = () => userSettings.settings.tools.terminal;
  const integration = path.join(profile, 'shellIntegration');
  let integrationWritten = false;
  return new TerminalTool(
    log,
    hostProcess(path.join(dist, 'ptyHost.js'), log),
    terminalSettings,
    (folder) => {
      if (!integrationWritten) {
        integrationWritten = true;
        try {
          writeShellIntegration(integration);
        } catch (error) {
          log.error(strings.log.writingShellIntegrationFailed);
          log.error(error);
        }
      }
      return shellLaunch(terminalSettings(), folder, {
        platform: process.platform,
        env: process.env,
        home: os.homedir(),
        version: app.getVersion(),
        isFolder,
        isFile,
        isProgram,
        integration,
      });
    },
    windowsPtyOf(process.platform, os.release()),
    {
      store: toolState(state, 'terminal'),
      home: os.homedir(),
      isFolder,
      now: () => Date.now(),
      choose: async () => {
        const chosen = await chooseFolders({
          title: strings.app.openInTerminal,
          buttonLabel: strings.app.open,
          properties: ['openDirectory', 'multiSelections'],
        });
        return chosen.canceled ? [] : chosen.filePaths;
      },
    },
  );
}

function isFile(file: string): Promise<boolean> {
  return fs.promises.stat(file).then(
    (stats) => stats.isFile(),
    () => false,
  );
}
