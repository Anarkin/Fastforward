import { bookmarkedCommits } from '../shared/refNames';
import type { GitToHost } from '../shared/protocol';
import type { Contexts } from './contexts';
import type { Refreshes } from './refreshes';
import type { GitSessions } from './sessions';
import type { GitStorage } from './storage';
import type { Session, TabWork } from './tabContext';
import { forgetHistory, historyLoaded } from './tabState';

export type RepositoryChoice = Extract<
  GitToHost,
  { readonly type: 'setSolo' | 'setBookmarks' }
>;

export class RepositoryChoices {
  constructor(
    private readonly storage: GitStorage,
    private readonly tabStates: ReadonlyMap<string, TabWork>,
    private readonly sessions: GitSessions,
    private readonly contexts: Contexts,
    private readonly refreshes: Refreshes,
    private readonly save: (saving: Promise<void>) => void,
  ) {}

  bookmarkedOf(repository: string): Set<string> {
    return bookmarkedCommits(this.storage.bookmarksOf(repository) ?? []);
  }

  async receive(session: Session, message: RepositoryChoice): Promise<void> {
    const { storage, sessions } = this;
    switch (message.type) {
      case 'setSolo': {
        const root = sessions.knownRoot(message.root);
        if (!sessions.hasRepository(sessions.repositoryOf(root))) {
          return;
        }
        const context = await this.contexts.context(session, root);
        this.save(storage.setSolo(root, message.solo));
        if (!context) {
          return;
        }
        context.post({ type: 'solo', solo: message.solo });
        context.post({ type: 'applyingSolo', running: true });
        try {
          forgetHistory(context.tab);
          context.tab.readingHistory?.abort();
          if (sessions.isActiveIn(session, root)) {
            await this.refreshes.refresh(context, () =>
              this.refreshes.sendCommits(
                context,
                this.contexts.refsOf(context),
                true,
              ),
            );
          }
        } finally {
          context.post({ type: 'applyingSolo', running: false });
        }
        return;
      }
      case 'setBookmarks': {
        const repository = sessions.repositoryOf(
          sessions.knownRoot(message.root),
        );
        if (!sessions.hasRepository(repository)) {
          return;
        }
        const before = this.bookmarkedOf(repository);
        this.save(
          storage.setBookmarks(
            repository,
            message.bookmarks.map(({ kind, name }) => ({ kind, name })),
          ),
        );
        const after = this.bookmarkedOf(repository);
        if (
          before.size !== after.size ||
          [...before].some((hash) => !after.has(hash))
        ) {
          await this.showBookmarked(session, repository);
        }
        return;
      }
      default:
        return message satisfies never;
    }
  }

  private async showBookmarked(
    session: Session,
    repository: string,
  ): Promise<void> {
    for (const [root, tab] of this.tabStates) {
      if (
        this.sessions.repositoryOf(root) !== repository ||
        !historyLoaded(tab)
      ) {
        continue;
      }
      const shownIn = this.sessions.sessionShowing(root);
      if (shownIn === undefined) {
        tab.shownStale = true;
        continue;
      }
      const context = await this.contexts.context(shownIn, root);
      if (context) {
        await tab.loadingHistory;
        await this.refreshes.sendShownHistory(context, {
          keepPlace: true,
          layOut: false,
        });
      }
    }
  }
}
