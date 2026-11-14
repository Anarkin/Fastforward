import { gitErrorText } from './cli/errorText';
import {
  extendedHistory,
  listHistory,
  listRecentHistory,
  logCommits,
  recentTips,
} from './cli/history';
import type { Commits } from './history/commits';
import type { Refs } from './cli/repository';
import type { Changed } from './cli/watch';
import {
  uncommittedCount,
  workingTreeFiles,
  type WorkingTree,
} from './cli/workingTree';
import type { Log } from '../../../shell/main/log';
import { fingerprint } from './refs';
import { workingTreeSide } from '../shared/comparisons';
import { commitPageSize, workingTreeHash } from '../shared/protocol';
import type { ShellAccess } from '../../../shell/main/shell';
import { strings } from '../../../lib/shared/strings';
import type { GitStorage } from './storage';
import {
  commitsMessage,
  firstPage,
  forgetHistory,
  historyLoaded,
  keepSubjects,
  layOutHistory,
  loadHistory,
  refsKeepHistory,
  stashesKeepHistory,
  stillThere,
  takeRefs,
  tipsInGitOrder,
  unselect,
} from './tabState';
import {
  type TabWork,
  type ReadRefs,
  type Session,
  type Refresh,
  type Context,
  shownCommit,
  nothing,
  allSettled,
} from './tabContext';
import type { Diffs } from './diffs';

export interface RefreshesHost {
  readonly live: (session: Session) => Session | undefined;
  readonly refsOf: (context: Context) => Promise<ReadRefs>;
  readonly sendRepository: (
    context: Context,
    refs: Promise<ReadRefs>,
  ) => Promise<void>;
  readonly rememberSelection: (context: Context) => void;
  readonly bookmarkedOf: (repository: string) => Set<string>;
  readonly sendNavigation: (
    context: Context,
    current?: string,
  ) => Promise<void>;
}

const everything: Changed = { refs: true, workingTree: true };

function toAll(contexts: readonly Context[]): Context | undefined {
  const [first] = contexts;
  if (!first || contexts.length === 1) {
    return first;
  }
  return {
    ...first,
    post: (message) => {
      for (const context of contexts) {
        context.post(message);
      }
    },
  };
}

export class Refreshes {
  constructor(
    private readonly log: Log,
    private readonly storage: GitStorage,
    private readonly shell: () => ShellAccess,
    private readonly diffs: Diffs,
    private readonly host: RefreshesHost,
  ) {}

  async refresh(
    context: Context,
    load?: () => Promise<void>,
    change: Changed = everything,
  ): Promise<void> {
    const { tab } = context;
    try {
      await this.queueRefresh(context, load, change);
    } catch (error) {
      tab.refreshError = gitErrorText(error);
      throw error;
    }
    if (tab.refreshError !== undefined) {
      context.post({ type: 'clearError', message: tab.refreshError });
      tab.refreshError = undefined;
    }
  }

  private queueRefresh(
    context: Context,
    load: (() => Promise<void>) | undefined,
    change: Changed,
  ): Promise<void> {
    const { tab } = context;
    const run = load ?? (() => this.refreshOnce(context, change));
    if (!tab.refreshing) {
      const done = Promise.withResolvers<void>();
      tab.refreshing = true;
      void this.runRefreshes(tab, { run, done });
      return done.promise;
    }
    if (load) {
      const done = Promise.withResolvers<void>();
      tab.loadsAgain.push({ run, done });
      return done.promise;
    }
    tab.refreshAgain.set(context.session, context);
    tab.changedAgain = {
      refs: tab.changedAgain.refs || change.refs,
      workingTree: tab.changedAgain.workingTree || change.workingTree,
    };
    tab.refreshedAgain ??= Promise.withResolvers();
    return tab.refreshedAgain.promise;
  }

  private async runRefreshes(tab: TabWork, first: Refresh): Promise<void> {
    let next: Refresh | undefined = first;
    while (next) {
      try {
        await next.run();
        next.done.resolve();
      } catch (error) {
        next.done.reject(error);
      }
      next = tab.loadsAgain.shift() ?? this.queuedRefresh(tab);
    }
    tab.refreshing = false;
  }

  private queuedRefresh(tab: TabWork): Refresh | undefined {
    const pages = new Map<Session | undefined, Context>();
    for (const [session, context] of tab.refreshAgain) {
      const page =
        session === undefined
          ? undefined
          : (this.host.live(session) ?? session);
      pages.set(page, pages.get(page) ?? context);
    }
    const again = toAll([...pages.values()]);
    const done = tab.refreshedAgain;
    if (!again || !done) {
      return undefined;
    }
    const change = tab.changedAgain;
    tab.refreshAgain.clear();
    tab.changedAgain = nothing;
    tab.refreshedAgain = undefined;
    return { run: () => this.refreshOnce(again, change), done };
  }

  private async refreshOnce(
    context: Context,
    { refs, workingTree }: Changed,
  ): Promise<void> {
    if (refs) {
      context.tab.indexPaths = undefined;
    }
    await allSettled([
      workingTree ? this.refreshWorkingTree(context) : Promise.resolve(),
      refs || context.tab.shownStale
        ? this.refreshHistory(context)
        : Promise.resolve(),
    ]);
  }

  private async refreshWorkingTree(context: Context): Promise<void> {
    const measured = context.tab.hash === workingTreeHash;
    const workingTree = await this.sendWorkingTree(context, measured);
    const { hash } = context.tab;
    const unmeasured = hash === workingTreeHash && !measured;
    if (hash !== undefined && workingTreeSide(hash) && !unmeasured) {
      await this.diffs.sendCommit(context, workingTree);
      if (
        context.tab.shown.tree?.hash === hash &&
        shownCommit(hash) === undefined
      ) {
        await this.diffs.sendTree(context, hash, workingTree);
      }
    }
  }

  private async refreshHistory(context: Context): Promise<void> {
    const refs = await this.host.refsOf(context);
    const { tab } = context;
    const { head, refs: listed, stashes, dates, shallow } = refs;
    if (shallow !== tab.shallow) {
      forgetHistory(tab);
    }
    if (fingerprint(head, listed, stashes) === tab.fingerprint) {
      if (tab.shownStale) {
        await this.sendShownHistory(context, { keepPlace: true });
      }
      return;
    }
    const known = Promise.resolve(refs);
    const solo = this.storage.soloOf(context.root);
    if (refsKeepHistory(tab, head, listed, solo, stashes, dates)) {
      this.log.info(strings.log.refsKept);
      const layOut = tab.shownStale || tab.headCommit !== head?.commit;
      takeRefs(tab, head, listed, stashes, dates);
      await Promise.all([
        this.host.sendRepository(context, known),
        this.sendShownHistory(context, { keepPlace: true, layOut }),
      ]);
      return;
    }
    const extended = historyLoaded(tab)
      ? await this.extendedHistory(context, refs, solo)
      : undefined;
    if (extended && this.storage.soloOf(context.root) === solo) {
      this.log.info(
        strings.log.refsExtended(extended.length - tab.fullHistory.length),
      );
      loadHistory(tab, extended, head, listed, stashes, dates);
      await Promise.all([
        this.host.sendRepository(context, known),
        this.sendShownHistory(context, { keepPlace: true }),
      ]);
      return;
    }
    this.log.info(strings.log.refsReloaded);
    await Promise.all([
      this.host.sendRepository(context, known),
      this.sendCommits(context, known, true),
    ]);
  }

  private async extendedHistory(
    context: Context,
    { head, refs, stashes, dates }: Refs,
    solo: boolean,
  ): Promise<Commits | undefined> {
    const { tab, gitPath, root } = context;
    if (!stashesKeepHistory(tab, stashes, solo)) {
      return undefined;
    }
    const older = tab.fullHistory;
    const extended = await extendedHistory(
      gitPath,
      root,
      older,
      tab.heads,
      tipsInGitOrder(head, refs, solo, stashes, dates),
      solo ? [] : stashes.map((stash) => stash.commit),
      dates,
      { signal: tab.closed.signal },
    ).catch((error: unknown) => {
      if (tab.closed.signal.aborted) {
        return undefined;
      }
      throw error;
    });
    return tab.fullHistory === older ? extended : undefined;
  }

  async sendWorkingTree(
    context: Context,
    measured = false,
  ): Promise<WorkingTree> {
    const workingTree = await workingTreeFiles(
      context.gitPath,
      context.root,
      undefined,
      undefined,
      undefined,
      measured,
    );
    context.post({ type: 'workingTree', files: uncommittedCount(workingTree) });
    return workingTree;
  }

  async sendCommits(
    context: Context,
    refs: Promise<Refs>,
    keepPlace = false,
  ): Promise<void> {
    const read = await refs;
    const { head, refs: listed, stashes } = read;
    const { tab } = context;
    const early = tab.shown.commits === undefined;
    const loading = new AbortController();
    const loaded = Promise.withResolvers<void>();
    if (early) {
      tab.loadingHistory = loaded.promise;
      if (read.commitGraph) {
        void this.shell().track(
          this.sendRecentHistory(context, read, loading.signal),
        );
      }
    }
    const reading = new AbortController();
    tab.readingHistory = reading;
    try {
      const solo = this.storage.soloOf(context.root);
      const fullHistory = await this.listFullHistory(
        context,
        solo,
        stashes.map((stash) => stash.commit),
        tipsInGitOrder(head, listed, solo, stashes),
        AbortSignal.any([tab.closed.signal, reading.signal]),
      ).catch((error: unknown) => {
        if (tab.closed.signal.aborted || reading.signal.aborted) {
          return undefined;
        }
        throw error;
      });
      if (fullHistory === undefined) {
        return;
      }
      loading.abort();
      loadHistory(tab, fullHistory, head, listed, stashes, read.dates);
      tab.shallow = read.shallow;
      if (this.storage.soloOf(context.root) !== solo) {
        forgetHistory(tab);
      }
      if (tab.hash !== undefined && !stillThere(tab)(tab.hash)) {
        unselect(tab);
        this.host.rememberSelection(context);
        context.post({ type: 'unselect', selection: tab.selection });
      }
      await this.sendShownHistory(context, { keepPlace: keepPlace || early });
    } finally {
      if (tab.readingHistory === reading) {
        tab.readingHistory = undefined;
      }
      loading.abort();
      loaded.resolve();
      if (tab.loadingHistory === loaded.promise) {
        tab.loadingHistory = undefined;
      }
    }
    const { back, forward } = tab.navigation;
    if (back.length + forward.length > 0) {
      await this.host.sendNavigation(context);
    }
  }

  private listFullHistory(
    context: Context,
    solo: boolean,
    stashes: readonly string[],
    tips: Iterable<string>,
    signal: AbortSignal,
  ): Promise<Commits> {
    return listHistory(
      context.gitPath,
      context.root,
      solo,
      stashes,
      signal,
      tips,
    );
  }

  private async listRecentHistory(
    context: Context,
    tips: readonly string[],
    stashes: readonly string[],
    signal: AbortSignal,
    count?: number,
  ): Promise<Commits | undefined> {
    const { history, whole } = await listRecentHistory(
      context.gitPath,
      context.root,
      tips,
      stashes,
      count,
      signal,
    );
    return whole ? undefined : history;
  }

  private async sendRecentHistory(
    context: Context,
    { head, refs, stashes, dates }: Refs,
    signal: AbortSignal,
  ): Promise<void> {
    const solo = this.storage.soloOf(context.root);
    try {
      const recent = await this.listRecentHistory(
        context,
        solo ? [] : recentTips(dates),
        solo ? [] : stashes.map((stash) => stash.commit),
        signal,
      );
      if (recent === undefined || signal.aborted) {
        return;
      }
      loadHistory(context.tab, recent, head, refs, stashes, dates, true);
      await this.sendShownHistory(context);
    } catch (error) {
      if (!signal.aborted) {
        this.log.error(strings.log.recentHistoryFailed);
        this.log.error(error);
      }
    }
  }

  async sendShownHistory(
    context: Context,
    {
      scrollTo,
      keepPlace = false,
      layOut = true,
    }: { scrollTo?: string; keepPlace?: boolean; layOut?: boolean } = {},
  ): Promise<void> {
    const { tab } = context;
    const generation = layOut ? this.layOut(tab) : ++tab.generation;
    const page = firstPage(tab, keepPlace, scrollTo);
    const { graph } = tab;
    const [commits] = await Promise.all([
      logCommits(
        context.gitPath,
        context.root,
        tab.history.hashes(page.start, page.start + 2 * commitPageSize),
      ).catch((error: unknown) => {
        if (tab.generation === generation) {
          tab.shownStale = true;
        }
        throw error;
      }),
      graph.walkTo(page.start, () => tab.graph === graph),
    ]);
    keepSubjects(tab, commits);
    if (tab.generation !== generation) {
      return;
    }
    context.post(
      commitsMessage(
        tab,
        page,
        commits,
        this.host.bookmarkedOf(context.repository),
      ),
    );
  }

  private layOut(tab: TabWork): number {
    const started = performance.now();
    const generation = layOutHistory(
      tab,
      this.storage.collapseMerges,
      tab.headCommit,
    );
    this.log.info(
      strings.log.laidOut(
        tab.history.length,
        tab.fullHistory.length,
        Math.round(performance.now() - started),
      ),
    );
    const { graph } = tab;
    void this.shell().track(
      graph.walkAhead(() => tab.graph === graph && !tab.closed.signal.aborted),
    );
    return generation;
  }

  async sendCommitPage(
    context: Context,
    generation: number,
    start: number,
    count: number,
  ): Promise<void> {
    const { tab } = context;
    const replaced = () => tab.generation !== generation;
    if (replaced()) {
      if (tab.shownStale) {
        await this.sendShownHistory(context, { keepPlace: true });
      }
      return;
    }
    const { history, graph } = tab;
    if (start >= history.length) {
      return;
    }
    const walked = graph.walkTo(start, () => tab.graph === graph);
    const commits = await logCommits(
      context.gitPath,
      context.root,
      history.hashes(start, start + count),
    ).catch((error: unknown) => {
      if (!replaced()) {
        context.post({
          type: 'commitPage',
          generation,
          start,
          count,
          commits: [],
          graph: [],
        });
      }
      throw error;
    });
    keepSubjects(tab, commits);
    await walked;
    if (replaced()) {
      return;
    }
    context.post({
      type: 'commitPage',
      generation,
      start,
      count,
      commits,
      graph: graph.rows(start, commits.length),
    });
  }
}
