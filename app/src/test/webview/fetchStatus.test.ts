import * as assert from 'node:assert';
import { fetchStatus } from '../../webview/fetchStatus';

const minute = 60_000;
const now = 1_000 * minute;

suite('Fetch status', () => {
  test('knows nothing of a repository never fetched', () => {
    assert.strictEqual(fetchStatus({}, 5, now), 'unknown');
  });

  test('is fresh while fetching every few minutes has not missed a round', () => {
    assert.strictEqual(
      fetchStatus({ succeeded: now - 10 * minute }, 5, now),
      'fresh',
    );
  });

  test('turns stale once fetching every few minutes missed a round, as when the computer slept', () => {
    assert.strictEqual(
      fetchStatus({ succeeded: now - 10 * minute - 1 }, 5, now),
      'stale',
    );
  });

  test('never turns stale while not fetching every few minutes, however old the fetch', () => {
    assert.strictEqual(
      fetchStatus({ succeeded: now - 100_000 * minute }, 0, now),
      'fresh',
    );
  });

  test('failed when the last fetch failed, until one succeeds again', () => {
    assert.strictEqual(fetchStatus({ failed: now }, 5, now), 'failed');
    assert.strictEqual(
      fetchStatus({ succeeded: now - minute, failed: now }, 0, now),
      'failed',
    );
    assert.strictEqual(
      fetchStatus({ succeeded: now, failed: now - minute }, 5, now),
      'fresh',
    );
  });
});
