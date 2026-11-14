import { readUpstream } from './branches';
import { findCommits, headCommit, logCommits, searchCommits } from './history';
import { step, visit } from './navigation';
import type { Log } from '../../../shell/main/log';
import { foundUpstream } from './operations';
import { comparedOf } from '../shared/comparisons';
import {
  workingTreeHash,
  type CommitResults,
  type CommitSearch,
  type Direction,
} from '../shared/protocol';
import type { ShellAccess } from '../../../shell/main/shell';
import { strings } from '../../../lib/shared/strings';
import type { GitStorage } from './storage';
import {
  expandMerges,
  hiddenSides,
  keepSubjects,
  mergesHidingCommit,
  navigationEntry,
  nearestSteps,
  select,
  stillThere,
} from './tabState';
import type { Session, Context, GitCore } from './tabContext';
import type { Diffs } from './diffs';
import type { Refreshes } from './refreshes';

export class CommitNavigation {
  readonly commitSearches = new Map<string, AbortController>();
  private readonly hashLookups = new Map<string, number>();

  constructor(
    private readonly log: Log,
    private readonly storage: GitStorage,
    private readonly shell: () => ShellAccess,
    private readonly diffs: Diffs,
    private readonly refreshes: Refreshes,
    private readonly core: GitCore,
  ) {}

  visit(context: Context, hash: string, replace = false): void {
    const { tab } = context;
    const next = visit(tab.navigation, tab.hash, hash, replace);
    if (next !== tab.navigation) {
      tab.navigation = next;
      void this.shell().track(
        this.sendNavigation(context, hash).catch((error: unknown) => {
          this.log.error(strings.log.navigationFailed);
          this.log.error(error);
        }),
      );
    }
  }

  async sendNavigation(
    context: Context,
    current = context.tab.hash,
  ): Promise<void> {
    const { tab } = context;
    const { navigation } = tab;
    const { back, forward } = nearestSteps(tab, current);
    const unknown = [...new Set([...back, ...forward])].filter(
      (hash) =>
        hash !== workingTreeHash &&
        !comparedOf(hash) &&
        !tab.subjects.has(hash),
    );
    if (unknown.length > 0) {
      keepSubjects(
        tab,
        await logCommits(context.gitPath, context.root, unknown),
      );
      if (tab.navigation !== navigation) {
        return;
      }
    }
    context.post({
      type: 'navigation',
      back: back.map((hash) => navigationEntry(tab, hash)),
      forward: forward.map((hash) => navigationEntry(tab, hash)),
    });
  }

  async searchCommits(
    session: Session,
    root: string,
    query: string,
  ): Promise<void> {
    this.commitSearches.get(root)?.abort();
    const search = new AbortController();
    this.commitSearches.set(root, search);
    try {
      const context = this.core.isActiveIn(session, root)
        ? await this.core.context(session)
        : undefined;
      await context?.tab.loadingHistory;
      if (!context || search.signal.aborted) {
        return;
      }
      const result = await this.commitsMatching(
        context,
        query,
        search.signal,
      ).catch((error: unknown) => {
        if (!search.signal.aborted) {
          context.post({
            type: 'commitSearch',
            query,
            result: { commits: [], capped: false },
          });
        }
        throw error;
      });
      if (!search.signal.aborted) {
        context.post({ type: 'commitSearch', query, result });
      }
    } catch (error) {
      if (!search.signal.aborted) {
        throw error;
      }
    } finally {
      if (this.commitSearches.get(root) === search) {
        this.commitSearches.delete(root);
      }
    }
  }

  private commitsMatching(
    context: Context,
    query: string,
    signal: AbortSignal,
  ): Promise<CommitSearch> {
    return searchCommits(
      context.gitPath,
      context.root,
      query,
      this.storage.soloOf(context.root),
      [...context.tab.stashes.keys()],
      signal,
    );
  }

  async lookupHash(context: Context, query: string): Promise<void> {
    const lookup = (this.hashLookups.get(context.root) ?? 0) + 1;
    this.hashLookups.set(context.root, lookup);
    const answer = (result: CommitResults) => {
      if (this.hashLookups.get(context.root) === lookup) {
        context.post({ type: 'hashLookup', query, result });
      }
    };
    answer(
      await this.commitsStartingWith(context, query).catch((error: unknown) => {
        answer({ commits: [], more: 0 });
        throw error;
      }),
    );
  }

  private commitsStartingWith(
    context: Context,
    query: string,
  ): ReturnType<typeof findCommits> {
    return findCommits(context.gitPath, context.root, query);
  }

  navigate(
    context: Context,
    direction: Direction,
    steps: number,
    picked: number | undefined,
  ): Promise<void> {
    const { tab } = context;
    const navigating = tab.navigating.then(() =>
      this.navigateNow(context, direction, steps, picked),
    );
    tab.navigating = navigating.catch(() => undefined);
    return navigating;
  }

  private async navigateNow(
    context: Context,
    direction: Direction,
    steps: number,
    picked: number | undefined,
  ): Promise<void> {
    const { tab } = context;
    if (tab.selection !== picked) {
      return;
    }
    const result = step(
      tab.navigation,
      tab.hash,
      direction,
      steps,
      stillThere(tab),
    );
    if (!result) {
      return;
    }
    tab.navigation = result.navigation;
    await this.showCommit(context, result.target, picked, false);
    await this.sendNavigation(context);
  }

  async showCommit(
    context: Context,
    hash: string,
    picked: number | undefined,
    record = true,
  ): Promise<void> {
    const { tab } = context;
    if (tab.selection !== picked) {
      return;
    }
    const merges = new Set(
      hiddenSides(tab, hash).flatMap((side) => mergesHidingCommit(tab, side)),
    );
    if (merges.size > 0) {
      expandMerges(tab, [...merges], this.storage.collapseMerges);
      await this.refreshes.sendShownHistory(context, { scrollTo: hash });
      if (tab.selection !== picked) {
        return;
      }
    }
    if (hiddenSides(tab, hash).length > 0) {
      this.core.notify(context)('error', strings.commits.notInHistory(hash));
      return;
    }
    if (record) {
      this.visit(context, hash);
    }
    select(tab, hash);
    this.core.rememberSelection(context);
    if (tab.index !== undefined) {
      context.post({
        type: 'reveal',
        hash,
        index: tab.index,
        selection: picked,
      });
    }
    await this.diffs.sendCommit(context);
  }

  async showUpstream(
    context: Context,
    picked: number | undefined,
  ): Promise<void> {
    const notify = this.core.notify(context);
    const upstream = foundUpstream(
      notify,
      await readUpstream(context.gitPath, context.root),
    );
    if (!upstream) {
      return;
    }
    if (
      this.storage.soloOf(context.root) &&
      !stillThere(context.tab)(upstream.commit)
    ) {
      notify('info', strings.messages.upstreamHidden(upstream.name));
      return;
    }
    await this.showCommit(context, upstream.commit, picked);
  }

  async showHead(context: Context, picked: number | undefined): Promise<void> {
    const head = await headCommit(context.gitPath, context.root);
    if (head) {
      await this.showCommit(context, head, picked);
    }
  }
}
