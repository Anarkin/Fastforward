import { dialog, shell } from 'electron';
import {
  findGit,
  minimumGitVersion,
  type GitSearch,
} from '../tools/git/main/locate';
import type { Log } from '../shell/main/log';
import { brand, strings } from '../lib/shared/strings';
import { withLoginShellEnv } from './shellPath';

export async function searchGit(): Promise<GitSearch> {
  await withLoginShellEnv(process.platform, process.env);
  return findGit();
}

export async function reportMissingGit(
  log: Log,
  git: Exclude<GitSearch, { kind: 'found' }>,
): Promise<void> {
  const needed = minimumGitVersion.join('.');
  const detail =
    git.kind === 'missing'
      ? strings.app.installGit(needed)
      : strings.app.gitTooOld(git.version, git.path, needed);
  log.error(detail);
  const { response } = await dialog.showMessageBox({
    type: 'error',
    title: brand,
    message: strings.app.needsGit,
    detail,
    buttons: [strings.app.downloadGit, strings.app.quit],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) {
    await shell.openExternal('https://git-scm.com/downloads');
  }
}
