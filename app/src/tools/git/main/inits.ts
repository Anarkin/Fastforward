import { strings } from '../../../lib/shared/strings';
import type { Log } from '../../../shell/main/log';
import { sameRoot } from '../../../lib/main/paths';
import { gitErrorText } from './errorText';
import { isFolder } from './folders';
import { initRepository } from './repository';
import { locateRepository, type Location } from './repositoryLocation';
import type { Session } from './tabContext';
import type { RepositoryOpening } from './repositoryOpening';

export class Inits {
  private initAsked: string | undefined;

  constructor(
    private readonly log: Log,
    private readonly gitPath: string,
    private readonly repositoryOpening: RepositoryOpening,
  ) {}

  async initIn(session: Session, folder: string): Promise<void> {
    let location: Location | undefined;
    try {
      location = (await isFolder(folder))
        ? await locateRepository(this.gitPath, folder)
        : undefined;
    } catch (error) {
      this.initFailed(session, folder, error);
      return;
    }
    if (location === undefined) {
      await this.initAndOpen(session, folder);
      return;
    }
    const { worktree } = location;
    if (worktree === undefined || sameRoot(worktree, folder)) {
      session.post({
        type: 'notice',
        level: 'info',
        message: strings.messages.alreadyRepository(folder),
      });
      await this.repositoryOpening.openRepositories(session, [folder]);
      return;
    }
    this.initAsked = folder;
    session.post({ type: 'confirmInit', folder, repository: worktree });
  }

  async initInside(session: Session, folder: string): Promise<void> {
    const asked = this.initAsked;
    if (asked !== undefined && sameRoot(asked, folder)) {
      this.initAsked = undefined;
      await this.initAndOpen(session, asked);
    }
  }

  private async initAndOpen(session: Session, folder: string): Promise<void> {
    try {
      await initRepository(this.gitPath, folder);
    } catch (error) {
      this.initFailed(session, folder, error);
      return;
    }
    this.log.info(strings.log.initialized(folder));
    await this.repositoryOpening.openRepositories(session, [folder]);
  }

  private initFailed(session: Session, folder: string, error: unknown): void {
    const text = gitErrorText(error);
    this.log.error(strings.log.initFailed(folder));
    this.log.error(error instanceof Error ? error : text);
    session.post({
      type: 'notice',
      level: 'error',
      message: strings.messages.couldNotInit(folder, text),
    });
  }
}
