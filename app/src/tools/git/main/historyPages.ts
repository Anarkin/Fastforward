import { logCommits } from './commitLog';
import { listHistory, listRecentHistory, recentTips } from './history';
import type { Commits } from './commits';
import type { Refs } from './refReads';
import type { Log } from '../../../shell/main/log';
import { commitPageSize } from '../shared/protocol';
import type { ShellAccess } from '../../../shell/main/toolContract';
import { strings } from '../../../lib/shared/strings';
import type { GitStorage } from './storage';
import { stillThere, unselect } from './tabState';
import { forgetHistory, loadHistory, tipsInGitOrder } from './tabHistory';
import { commitsMessage, firstPage, layOutHistory } from './tabLayout';
import { keepSubjects } from './tabSteps';
import type { TabWork, Context } from './tabContext';

export interface HistoryPagesHost {
  readonly rememberSelection: (context: Context) => void;
  readonly bookmarkedOf: (repository: string) => Set<string>;
  readonly sendNavigation: (
    context: Context,
    current?: string,
  ) => Promise<void>;
}

export class HistoryPages {
  constructor(
    private readonly log: Log,
    private readonly storage: GitStorage,
    private readonly shell: () => ShellAccess,
    private readonly host: HistoryPagesHost,
  ) {}

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
      this.storage.preferences.collapseMerges,
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
