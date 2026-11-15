import { clipboard } from 'electron';
import type { Log } from '../shell/main/log';
import { strings } from '../lib/shared/strings';
import type { UserSettings } from '../shell/main/userSettings';
import type { JsonFileStore } from '../shell/main/stateFile';
import { toolState } from '../shell/main/storage';
import { GitStorage } from '../tools/git/main/storage';
import { GitTool } from '../tools/git/main/tool';

export interface GitHostDeps {
  readonly log: Log;
  readonly gitPath: string;
  readonly userSettings: UserSettings;
  readonly state: JsonFileStore;
  readonly viewedFiles: string;
  readonly chooseFolders: (
    options: Electron.OpenDialogOptions,
  ) => Promise<Electron.OpenDialogReturnValue>;
}

export function gitToolOf({
  log,
  gitPath,
  userSettings,
  state,
  viewedFiles,
  chooseFolders,
}: GitHostDeps): GitTool {
  return new GitTool(
    log,
    gitPath,
    new GitStorage(userSettings, toolState(state, 'git')),
    {
      viewedFiles,
      chooseFolders: async () => {
        const chosen = await chooseFolders({
          title: strings.app.openRepositories,
          buttonLabel: strings.app.open,
          properties: ['openDirectory', 'multiSelections'],
        });
        return chosen.canceled ? [] : chosen.filePaths;
      },
      chooseFolder: async (purpose, from) => {
        const chosen = await chooseFolders({
          ...(purpose === 'init'
            ? {
                title: strings.app.initRepository,
                buttonLabel: strings.app.init,
              }
            : {
                title: strings.app.cloneInto,
                buttonLabel: strings.app.choose,
              }),
          ...(from !== undefined && { defaultPath: from }),
          properties: ['openDirectory', 'createDirectory'],
        });
        return chosen.canceled ? undefined : chosen.filePaths[0];
      },
      clipboardText: () => clipboard.readText(),
    },
  );
}
