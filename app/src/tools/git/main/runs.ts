import { gitErrorText } from './errorText';
import { isFolder } from './folders';
import { hasGitFolder } from './repository';
import type { Log } from '../../../shell/main/log';
import type { ShellAccess } from '../../../shell/main/toolContract';
import { strings } from '../../../lib/shared/strings';
import { type TabWork, type Session, OpeningFailed } from './tabContext';
import type { GitSessions } from './sessions';

export class Runs {
  constructor(
    private readonly log: Log,
    private readonly shell: () => ShellAccess,
    private readonly sessions: GitSessions,
    private readonly tabStates: ReadonlyMap<string, TabWork>,
  ) {}

  run(
    failed: string,
    session: Session,
    action: () => Promise<void>,
    root?: string,
  ): Promise<void> {
    return this.shell().track(this.runNow(failed, session, action, root));
  }

  async runNow(
    failed: string,
    session: Session,
    action: () => Promise<void>,
    asked?: string,
  ): Promise<void> {
    try {
      await action();
    } catch (thrown) {
      const { root, error } =
        thrown instanceof OpeningFailed
          ? thrown
          : { root: asked, error: thrown };
      const text = gitErrorText(error);
      this.log.error(failed);
      this.log.error(error instanceof Error ? error : text);
      const gone = root !== undefined && (await this.folderGone(root));
      if (root === undefined || this.sessions.isActiveIn(session, root)) {
        session.post({
          type: 'error',
          message: gone ? strings.messages.notRepository(root) : text,
        });
      }
    }
  }

  private async folderGone(root: string): Promise<boolean> {
    const tab = this.tabStates.get(root);
    if (!tab || ((await isFolder(root)) && (await hasGitFolder(root)))) {
      return false;
    }
    tab.isRepository = false;
    if (tab.refreshError !== undefined) {
      tab.refreshError = strings.messages.notRepository(root);
    }
    return true;
  }
}
