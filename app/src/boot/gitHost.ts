import { clipboard } from 'electron';
import type { Log } from '../shell/main/log';
import { strings } from '../lib/shared/strings';
import type { UserSettings } from '../shell/main/userSettings';
import type { JsonFileStore } from '../shell/main/stateFile';
import { toolState } from '../shell/main/storage';
import { GitStorage } from '../tools/git/main/storage';
import { GitTool } from '../tools/git/main/tool';
import type { GitLocator } from '../tools/git/main/gitLocator';
import type { PatternSearch } from '../lib/main/patternSearch';

export interface GitHostDeps {
  readonly log: Log;
  readonly git: GitLocator;
  readonly userSettings: UserSettings;
  readonly state: JsonFileStore;
  readonly viewedFiles: string;
  readonly chooseFolders: (
    options: Electron.OpenDialogOptions,
  ) => Promise<Electron.OpenDialogReturnValue>;
  readonly patterns: PatternSearch;
}

export function gitToolOf({
  log,
  git,
  userSettings,
  state,
  viewedFiles,
  chooseFolders,
  patterns,
}: GitHostDeps): GitTool {
  return new GitTool(
    log,
    git,
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
      patterns,
    },
  );
}
