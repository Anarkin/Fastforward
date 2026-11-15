import type { LastFetch } from '../shared/protocol';
import type { Store } from '../../../shell/main/stateFile';
import { keyIn, keyOf, recordOf, withoutRoots } from './rootRecords';

export const lastFetchesKey = 'lastFetches';
const fetchesSavedEvery = 10 * 60_000;

export class LastFetches {
  private readonly unsavedFetches = new Map<string, LastFetch>();
  private fetchesSavedAt: number | undefined;

  constructor(private readonly state: Store) {}

  lastFetchOf(repository: string): LastFetch {
    const unsaved = this.unsavedFetches.get(
      keyIn(this.unsavedFetches, repository),
    );
    if (unsaved !== undefined) {
      return unsaved;
    }
    const all = this.lastFetches;
    const { succeeded, failed } = recordOf(all[keyOf(all, repository)]);
    return {
      ...(typeof succeeded === 'number' && { succeeded }),
      ...(typeof failed === 'number' && { failed }),
    };
  }

  async recordFetch(
    repository: string,
    failed: boolean,
    at: number,
  ): Promise<void> {
    this.unsavedFetches.set(keyIn(this.unsavedFetches, repository), {
      ...this.lastFetchOf(repository),
      [failed ? 'failed' : 'succeeded']: at,
    });
    const savedAt = this.fetchesSavedAt;
    if (savedAt === undefined || at - savedAt >= fetchesSavedEvery) {
      this.fetchesSavedAt = at;
      await this.saveFetches();
    }
  }

  async saveFetches(): Promise<void> {
    if (this.unsavedFetches.size === 0) {
      return;
    }
    const all = this.lastFetches;
    for (const [repository, fetched] of this.unsavedFetches) {
      all[keyOf(all, repository)] = fetched;
    }
    this.unsavedFetches.clear();
    await this.state.update(lastFetchesKey, all);
  }

  async forget(repository: string): Promise<void> {
    this.unsavedFetches.delete(keyIn(this.unsavedFetches, repository));
    await withoutRoots(this.state, lastFetchesKey, [repository]);
  }

  private get lastFetches(): Record<string, unknown> {
    return recordOf(this.state.get(lastFetchesKey));
  }
}
