import type { Log } from '../shell/main/log';
import type { UserSettings } from '../shell/main/userSettings';
import { needsGit, type GitLocator } from '../tools/git/main/gitLocator';
import { runGit } from '../tools/git/main/run';
import { DiffTool } from '../tools/diff/main/tool';

export interface DiffHostDeps {
  readonly log: Log;
  readonly userSettings: UserSettings;
  readonly git: GitLocator;
}

export function diffToolOf({ log, userSettings, git }: DiffHostDeps): DiffTool {
  return new DiffTool({
    log,
    userSettings,
    run: (cwd, args, options) => runGit(git.pathToRun(), cwd, args, options),
    missingGit: async () => {
      const found = await git.located();
      return found.kind === 'found' ? undefined : needsGit(found);
    },
  });
}
