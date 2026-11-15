import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import type { Store } from '../../../../../shell/main/stateFile';
import {
  LastFetches,
  lastFetchesKey,
} from '../../../../../tools/git/main/lastFetches';
import { FakeStore } from '../../../../helpers/fakeStore';

function storageOf(state: Store = new FakeStore()): LastFetches {
  return new LastFetches(state);
}

suite('Last fetches', () => {
  test('keeps when each repository last fetched and last failed to, for the next start', async () => {
    const state = new FakeStore();
    const storage = storageOf(state);
    const root = path.resolve('r');
    assert.deepStrictEqual(storage.lastFetchOf(root), {});
    await storage.recordFetch(root, true, 1);
    await storage.recordFetch(root, false, 2);
    await storage.recordFetch(`${root}${path.sep}`, true, 3);
    await storage.saveFetches();
    assert.deepStrictEqual(storageOf(state).lastFetchOf(root), {
      succeeded: 2,
      failed: 3,
    });
    assert.deepStrictEqual(storage.lastFetchOf(path.resolve('other')), {});
  });

  test('saves when the repositories last fetched at once, then at most every ten minutes, keeping the times between for the page until then or until saved', async () => {
    const store = new FakeStore();
    const saved: string[] = [];
    const storage = storageOf({
      get: (key) => store.get(key),
      update: (key, value) => {
        saved.push(key);
        return store.update(key, value);
      },
    });
    const [r1, r2] = [path.resolve('r1'), path.resolve('r2')];
    const minute = 60_000;
    const fetchedOf = (root: string) => storageOf(store).lastFetchOf(root);
    await storage.recordFetch(r1, false, minute);
    assert.deepStrictEqual(fetchedOf(r1), { succeeded: minute });
    await storage.recordFetch(r1, false, 2 * minute);
    await storage.recordFetch(r2, true, 3 * minute);
    assert.deepStrictEqual(storage.lastFetchOf(r1), { succeeded: 2 * minute });
    assert.deepStrictEqual(storage.lastFetchOf(r2), { failed: 3 * minute });
    assert.deepStrictEqual(
      [fetchedOf(r1), fetchedOf(r2)],
      [{ succeeded: minute }, {}],
    );
    await storage.recordFetch(r1, true, 11 * minute);
    assert.deepStrictEqual(
      [fetchedOf(r1), fetchedOf(r2)],
      [{ succeeded: 2 * minute, failed: 11 * minute }, { failed: 3 * minute }],
    );
    await storage.recordFetch(r2, false, 12 * minute);
    await storage.saveFetches();
    await storage.saveFetches();
    assert.deepStrictEqual(fetchedOf(r2), {
      succeeded: 12 * minute,
      failed: 3 * minute,
    });
    assert.deepStrictEqual(saved, [
      lastFetchesKey,
      lastFetchesKey,
      lastFetchesKey,
    ]);
  });
});
