import * as path from 'node:path';
import { keptGits } from './run';
import { listWorktrees, type Worktree } from './repositoryLocation';
import type { Log } from '../../../shell/main/log';
import { shortHash } from '../shared/hashes';
import type { WorktreeInfo } from '../shared/protocol';
import { strings } from '../../../lib/shared/strings';
import { sameRoot } from '../../../lib/main/paths';
import type { GitStorage } from './storage';
import type { TabWork, Session, GitCore } from './tabContext';
import type { CommitSearch } from './commitSearch';
import { tabName } from './tabNames';

export interface WorktreesHost {
  readonly repositoryOf: (root: string) => string;
  readonly isActive: (root: string) => boolean;
  readonly sendTabs: (session: Session) => void;
  readonly forgetKept: (root: string) => void;
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
    private readonly gitPath: () => string,
    private readonly storage: GitStorage,
    private readonly core: GitCore,
    private readonly commitSearch: CommitSearch,
    private readonly tabStates: Map<string, TabWork>,
    private readonly repositories: Map<string, string>,
    private readonly worktreeLists: Map<string, readonly WorktreeInfo[]>,
    private readonly host: WorktreesHost,
  ) {}

  takeWorktrees(
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
    this.host.forgetKept(root);
    keptGits.stopIn(root);
    tab.closed.abort();
    tab.loadingFiles.abort();
    tab.loadingDiff.abort();
    this.commitSearch.commitSearches.get(root)?.abort();
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
    return listWorktrees(this.gitPath(), repository, known);
  }
}
