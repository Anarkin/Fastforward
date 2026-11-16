import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { RecentCache } from '../../../../../tools/commander/page/recentCache';

suite('Cache of the tabs shown last', () => {
  test('keeps what the few tabs shown last drew, letting go of the one shown longest ago, so a tab shown again draws at once and the others read again', () => {
    const cache = new RecentCache<string>(2);
    cache.shown('1');
    cache.keep('1', 'text of 1');
    cache.shown('2');
    cache.keep('2', 'text of 2');
    cache.shown('1');
    cache.shown('3');

    assert.deepStrictEqual(
      ['1', '2', '3'].map((tab) => [cache.holds(tab), cache.of(tab)]),
      [
        [true, 'text of 1'],
        [false, undefined],
        [true, undefined],
      ],
    );
  });

  test('keeps nothing of a tab not shown among the last, and forgets a tab let go', () => {
    const cache = new RecentCache<string>(2);
    cache.keep('1', 'text of 1');
    assert.strictEqual(cache.holds('1'), false);
    cache.shown('1');
    cache.keep('1', 'text of 1');
    cache.forget('1');
    assert.deepStrictEqual(
      [cache.holds('1'), cache.of('1')],
      [false, undefined],
    );
  });
});
