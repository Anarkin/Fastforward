import { findCommits } from './commitLookup';
import { searchCommits } from './commitMatches';
import type { SearchOptions } from '../../../lib/shared/searchOptions';
import type {
  CommitResults,
  CommitSearch as CommitSearchResult,
} from '../shared/protocol';
import type { GitStorage } from './storage';
import type { Session, Context, GitCore } from './tabContext';

export class CommitSearch {
  readonly commitSearches = new Map<string, AbortController>();
  private readonly hashLookups = new Map<string, number>();

  constructor(
    private readonly storage: GitStorage,
    private readonly core: GitCore,
  ) {}

  async searchCommits(
    session: Session,
    root: string,
    query: string,
    options: SearchOptions,
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
        options,
        search.signal,
      ).catch((error: unknown) => {
        if (!search.signal.aborted) {
          context.post({
            type: 'commitSearch',
            query,
            options,
            result: { commits: [], capped: false },
          });
        }
        throw error;
      });
      if (!search.signal.aborted) {
        context.post({ type: 'commitSearch', query, options, result });
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
    options: SearchOptions,
    signal: AbortSignal,
  ): Promise<CommitSearchResult> {
    return searchCommits(
      context.gitPath,
      context.root,
      query,
      options,
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
}
