import type { Log } from '../shell/main/log';
import type { UserSettings } from '../shell/main/userSettings';
import { needsGit, type GitLocator } from '../tools/git/main/gitLocator';
import { runGit } from '../tools/git/main/run';
import { DiffTool } from '../tools/diff/main/tool';
import type { GitTool } from '../tools/git/main/tool';

export interface DiffHostDeps {
  readonly log: Log;
  readonly userSettings: UserSettings;
  readonly git: GitLocator;
  readonly gitTool: Pick<GitTool, 'versionCopy' | 'fileHistory'>;
}

export function diffToolOf({
  log,
  userSettings,
  git,
  gitTool,
}: DiffHostDeps): DiffTool {
  return new DiffTool({
    log,
    userSettings,
    run: (cwd, args, options) => runGit(git.pathToRun(), cwd, args, options),
    missingGit: async () => {
      const found = await git.located();
      return found.kind === 'found' ? undefined : needsGit(found);
    },
    versionCopy: (file, rev) => gitTool.versionCopy(file, rev),
    fileHistory: (file) => gitTool.fileHistory(file),
  });
}
