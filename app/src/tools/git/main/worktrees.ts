import * as path from 'node:path';
import { gitErrorText } from './cli/errorText';
import { keptGits } from './cli/run';
import { isFolder, spellingOf } from './cli/repository';
import {
  listWorktrees,
  locateRepository,
  type Location,
  type Worktree,
} from './cli/worktrees';
import type { Log } from '../../../shell/main/log';
import { shortHash } from '../shared/hashes';
import type { WorktreeInfo } from '../shared/protocol';
import type { ShellAccess } from '../../../shell/main/shell';
import { strings } from '../../../shared/strings';
import { maxRecentItems, sameRoot } from '../../../shell/main/storage';
import type { GitStorage } from './storage';
import { replayOf } from './tabState';
import {
  type TabWork,
  type Session,
  type Context,
  allSettled,
  type GitCore,
  OpeningFailed,
} from './tabContext';
import type { Navigation } from './navigation';
import { tabName } from './tabNames';
import type { Watching } from './watching';

export interface WorktreesHost {
  readonly repositoryTabs: () => string[];
  readonly repositoryOf: (root: string) => string;
  readonly isActive: (root: string) => boolean;
  readonly tabState: (root: string) => TabWork;
  readonly showTab: (context: Context) => Promise<void>;
  readonly postTabs: (session: Session) => void;
  readonly sendTabs: (session: Session) => void;
  readonly sendRecentEverywhere: () => void;
}

function worktreeInfos(worktrees: readonly Worktree[]): WorktreeInfo[] {
  const [first] = worktrees;
  const main = first !== undefined && !first.bare;
  return worktrees
    .filter((worktree) => !worktree.bare)
    .map((worktree, index) => ({
      root: worktree.path,
      name:
        worktree.branch ??
        (worktree.head === undefined
          ? tabName(worktree.path)
          : shortHash(worktree.head)),
      folder: path.basename(worktree.path),
      main: main && index === 0,
      missing: worktree.missing,
    }));
}

export class Worktrees {
  private readonly worktreeListings = new Map<string, number>();

  constructor(
    private readonly log: Log,
    private readonly gitPath: string,
    private readonly storage: GitStorage,
    private readonly shell: () => ShellAccess,
    private readonly core: GitCore,
    private readonly watching: Watching,
    private readonly navigation: Navigation,
    private readonly tabStates: Map<string, TabWork>,
    private readonly repositories: Map<string, string>,
    private readonly worktreeLists: Map<string, readonly WorktreeInfo[]>,
    private readonly host: WorktreesHost,
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
      const usable = this.takeWorktrees(repository, location.worktrees).filter(
        (worktree) => !worktree.bare && !worktree.missing,
      );
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
        this.loadWorktrees(session, active),
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

  private takeWorktrees(
    repository: string,
    worktrees: readonly Worktree[],
  ): Worktree[] {
    const [first, ...rest] = worktrees;
    const spelled = first ? [{ ...first, path: repository }, ...rest] : [];
    for (const worktree of spelled) {
      this.repositories.set(worktree.path, repository);
    }
    this.worktreeLists.set(repository, worktreeInfos(spelled));
    return spelled;
  }

  async loadWorktrees(session: Session, repository: string): Promise<void> {
    const listing = (this.worktreeListings.get(repository) ?? 0) + 1;
    this.worktreeListings.set(repository, listing);
    const worktrees = await this.listedWorktrees(repository);
    if (
      worktrees === undefined ||
      this.worktreeListings.get(repository) !== listing
    ) {
      return;
    }
    const shown = JSON.stringify(this.worktreeLists.get(repository));
    this.forgetRemovedWorktrees(
      repository,
      this.takeWorktrees(repository, worktrees),
    );
    const shownIn = this.core.sessionShowingRepository(repository);
    if (
      JSON.stringify(this.worktreeLists.get(repository)) !== shown &&
      shownIn !== undefined
    ) {
      const page = this.core.live(shownIn);
      if (page) {
        this.host.sendTabs(page);
      }
    }
  }

  private forgetRemovedWorktrees(
    repository: string,
    listed: readonly Worktree[],
  ): void {
    for (const [root, tab] of this.tabStates) {
      if (
        sameRoot(this.host.repositoryOf(root), repository) &&
        !listed.some((worktree) => sameRoot(worktree.path, root)) &&
        !this.host.isActive(root)
      ) {
        this.forgetTab(root, tab);
      }
    }
    for (const [root, owner] of this.repositories) {
      if (
        sameRoot(owner, repository) &&
        !sameRoot(root, repository) &&
        !listed.some((worktree) => sameRoot(worktree.path, root)) &&
        !this.host.isActive(root)
      ) {
        this.repositories.delete(root);
      }
    }
  }

  forgetTab(root: string, tab: TabWork): void {
    this.tabStates.delete(root);
    keptGits.stopIn(root);
    tab.closed.abort();
    tab.loadingFiles.abort();
    tab.loadingDiff.abort();
    this.navigation.commitSearches.get(root)?.abort();
  }

  private async listedWorktrees(
    repository: string,
  ): Promise<Worktree[] | undefined> {
    const known = [
      repository,
      this.storage.worktreeOf(repository),
      ...(this.worktreeLists.get(repository) ?? []).map(
        (worktree) => worktree.root,
      ),
    ];
    try {
      return await this.worktreesOf(repository, known);
    } catch (error) {
      this.log.error(strings.log.listingWorktreesFailed(repository));
      this.log.error(error);
      return undefined;
    }
  }

  private worktreesOf(
    repository: string,
    known: readonly string[],
  ): Promise<Worktree[]> {
    return listWorktrees(this.gitPath, repository, known);
  }
}
