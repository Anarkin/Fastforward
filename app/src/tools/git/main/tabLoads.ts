import type { Log } from '../../../shell/main/log';
import { strings } from '../../../lib/shared/strings';
import { newTabState } from './tabState';
import { historyLoaded } from './tabHistory';
import type { Context, Session } from './tabContext';
import { allSettled } from './allSettled';
import type { Contexts } from './contexts';
import type { TabPosts } from './tabPosts';
import type { Refreshes } from './refreshes';
import type { Diffs } from './diffs';
import type { HistoryPages } from './historyPages';

export class TabLoads {
  constructor(
    private readonly log: Log,
    private readonly contexts: Contexts,
    private readonly posts: TabPosts,
    private readonly refreshes: Refreshes,
    private readonly diffs: Diffs,
    private readonly historyPages: HistoryPages,
    private readonly repositories: Map<string, string>,
  ) {}

  async showTab(context: Context): Promise<void> {
    const { tab } = context;
    const resend = tab.diffStale && tab.opened;
    tab.diffStale = false;
    if (resend && tab.hash !== undefined) {
      await this.diffs.sendDiff(context, tab.hash);
    }
    const firstOpen = !context.tab.opened;
    context.tab.opened = true;
    if (!firstOpen && context.tab.shown.commits) {
      this.log.info(strings.log.tabShownAsLeft(context.root));
      await this.posts.addDefaultBookmarks(context);
      await this.refreshes.refresh(context);
      return;
    }
    await this.loadTab(context);
  }

  async loadTab(context: Context): Promise<void> {
    const refs = this.contexts.refsOf(context);
    await allSettled([
      this.posts.addDefaultBookmarks(context, refs),
      this.refreshes.refresh(context, () => {
        context.tab.indexPaths = undefined;
        return allSettled([
          (async () => {
            if (!historyLoaded(context.tab)) {
              await this.historyPages.sendCommits(context, refs);
            } else if (context.tab.shownStale) {
              await this.historyPages.sendShownHistory(context, {
                keepPlace: true,
              });
            }
            await this.diffs.sendCommit(context);
          })(),
          this.refreshes.sendWorkingTree(context),
        ]);
      }),
      this.posts.sendRepository(context, refs),
    ]);
  }

  async preloadRoot(
    session: Session,
    root: string,
    repository: string,
  ): Promise<void> {
    this.repositories.set(root, repository);
    const tab = this.contexts.tabState(root);
    if (tab.opened || tab.preloading) {
      return;
    }
    const selected = { hash: tab.hash, path: tab.path, area: tab.area };
    tab.preloading = (async () => {
      try {
        const context = await this.contexts.context(session, root, false);
        if (!context || tab.opened) {
          return;
        }
        this.log.info(strings.log.preloading(root));
        tab.opened = true;
        await this.loadTab(context);
      } catch (error) {
        Object.assign(tab, newTabState(), selected);
        this.log.error(strings.log.preloadingFailed(root));
        this.log.error(error);
      } finally {
        tab.preloading = undefined;
      }
    })();
    await tab.preloading;
  }
}
