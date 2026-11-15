import { gitErrorText } from './errorText';
import { isFolder, spellingOf } from './folders';
import {
  locateRepository,
  type Location,
  type Worktree,
} from './repositoryLocation';
import type { Log } from '../../../shell/main/log';
import type { WorktreeInfo } from '../shared/protocol';
import type { ShellAccess } from '../../../shell/main/toolContract';
import { strings } from '../../../lib/shared/strings';
import { maxRecentItems } from '../../../shell/main/storage';
import { sameRoot } from '../../../lib/main/paths';
import type { GitStorage } from './storage';
import { replayOf } from './tabReplay';
import {
  type TabWork,
  type Session,
  type Context,
  type GitCore,
  OpeningFailed,
} from './tabContext';
import { allSettled } from './allSettled';
import type { Watching } from './watching';

export interface RepositoryOpeningHost {
  readonly repositoryTabs: () => string[];
  readonly tabState: (root: string) => TabWork;
  readonly showTab: (context: Context) => Promise<void>;
  readonly postTabs: (session: Session) => void;
  readonly sendRecentEverywhere: () => void;
  readonly takeWorktrees: (
    repository: string,
    worktrees: readonly Worktree[],
  ) => Worktree[];
  readonly loadWorktrees: (
    session: Session,
    repository: string,
  ) => Promise<void>;
}

export class RepositoryOpening {
  constructor(
    private readonly log: Log,
    private readonly gitPath: string,
    private readonly storage: GitStorage,
    private readonly shell: () => ShellAccess,
    private readonly core: GitCore,
    private readonly watching: Watching,
    private readonly repositories: Map<string, string>,
    private readonly worktreeLists: Map<string, readonly WorktreeInfo[]>,
    private readonly host: RepositoryOpeningHost,
  ) {}

  async openRepositories(
    session: Session,
    folders: readonly string[],
    reopened = false,
  ): Promise<void> {
    const page = () => this.core.live(session) ?? session;
    const repositories = await this.addRepositories(session, folders, reopened);
    this.host.sendRecentEverywhere();
    await this.shell().open(page().page, 'git', repositories, true);
  }

  private async addRepositories(
    session: Session,
    folders: readonly string[],
    reopened = false,
  ): Promise<string[]> {
    const { storage } = this;
    const page = () => this.core.live(session) ?? session;
    const repositories: string[] = [];
    for (const folder of folders) {
      let location: Location | undefined;
      try {
        location = await locateRepository(this.gitPath, folder);
      } catch (error) {
        this.log.error(strings.log.openingFailed(folder));
        this.log.error(error instanceof Error ? error : String(error));
        page().post({
          type: 'notice',
          level: 'error',
          message: strings.messages.couldNotOpen(folder, gitErrorText(error)),
        });
        continue;
      }
      if (!location && !(await isFolder(folder))) {
        page().post({
          type: 'notice',
          level: 'error',
          message: strings.messages.couldNotOpen(
            folder,
            strings.messages.unreachable,
          ),
        });
        continue;
      }
      if (!location) {
        this.core.save(
          storage.removeRecent(folder).then(() => this.forgetUnused([folder])),
        );
        page().post({
          type: 'notice',
          level: 'error',
          message: strings.messages.notInRepository(folder),
        });
        continue;
      }
      const repository = await spellingOf(
        location.repository,
        this.host.repositoryTabs(),
      );
      const usable = this.host
        .takeWorktrees(repository, location.worktrees)
        .filter((worktree) => !worktree.bare && !worktree.missing);
      const saved = storage.worktreeOf(repository);
      const picked =
        reopened || location.worktree === undefined
          ? undefined
          : await spellingOf(
              location.worktree,
              usable.map((other) => other.path),
            );
      const worktree =
        picked ??
        usable.find((other) => sameRoot(other.path, saved))?.path ??
        usable[0]?.path;
      if (worktree !== undefined) {
        this.core.save(storage.setWorktree(repository, worktree));
      }
      repositories.push(repository);
      this.addRecent(repository);
      this.shell().visited(worktree ?? repository);
    }
    return repositories;
  }

  async openTab(session: Session, active: string): Promise<void> {
    if (session.disposed) {
      return;
    }
    this.host.postTabs(session);
    const worktree = this.storage.worktreeOf(active);
    this.repositories.set(worktree, active);
    const tab = this.host.tabState(worktree);
    try {
      await allSettled([
        this.host.loadWorktrees(session, active),
        this.openWorktree(session, worktree),
      ]);
      tab.refused = false;
    } catch (error) {
      tab.refused = true;
      throw new OpeningFailed(worktree, error);
    }
  }

  private async openWorktree(session: Session, root: string): Promise<void> {
    const tab = this.host.tabState(root);
    for (const message of replayOf(tab)) {
      session.post(message);
    }
    await tab.preloading;
    if (!this.core.isActiveIn(session, root)) {
      return;
    }
    this.watching.stopWatching(session);
    const context = await this.core.context(session);
    if (
      !context ||
      session.disposed ||
      !this.core.isActiveIn(session, context.root)
    ) {
      return;
    }
    this.log.info(strings.log.tabOpen(context.root));
    this.addRecent(context.repository);
    await allSettled([
      this.watching.watch(context, session),
      this.host.showTab(context),
    ]);
  }

  private addRecent(repository: string): void {
    const last = this.storage.recent.slice(maxRecentItems - 1);
    this.core.save(
      this.storage.addRecent(repository).then(() => this.forgetUnused(last)),
    );
  }

  async forgetUnused(roots: readonly string[]): Promise<void> {
    const { recent } = this.storage;
    for (const root of roots) {
      if (
        !recent.some((kept) => sameRoot(kept, root)) &&
        !this.core.hasRepository(root)
      ) {
        const worktrees = [...this.worktreeLists].find(([repository]) =>
          sameRoot(repository, root),
        )?.[1];
        await this.storage.forget(
          root,
          (worktrees ?? []).map((worktree) => worktree.root),
        );
      }
    }
  }
}
