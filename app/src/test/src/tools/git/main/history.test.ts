import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  extendedHistory,
  parseHistory,
  recentTips,
} from '../../../../../tools/git/main/history';
import { Commits } from '../../../../../tools/git/main/commits';

suite('Git rev-list parser', () => {
  test('parses hashes and parents', () => {
    assert.deepStrictEqual(parseHistory('aaa bbb ccc\nbbb\n'), [
      { hash: 'aaa', parents: ['bbb', 'ccc'] },
      { hash: 'bbb', parents: [] },
    ]);
  });
});

suite('Recent tips', () => {
  const day = 24 * 60 * 60;

  test('picks the commits of the refs committed within 60 days of the newest of them, however long ago that was', () => {
    const newest = 1_000_000_000;
    const dates = new Map([
      ['old', newest - 61 * day],
      ['new', newest],
      ['edge', newest - 60 * day],
    ]);
    assert.deepStrictEqual(recentTips(dates), ['new', 'edge']);
  });

  test('picks nothing without refs', () => {
    assert.deepStrictEqual(recentTips(new Map()), []);
  });

  test(
    'picks among more refs than a call takes arguments',
    { timeout: 20_000 },
    () => {
      const dates = new Map(
        Array.from({ length: 500_000 }, (_, index) => [`c${index}`, index]),
      );
      assert.strictEqual(recentTips(dates).length, 500_000);
    },
  );
});

suite('Extending a history', () => {
  test('leaves it to be read whole without running git when no tip is new, as only new commits can build on the old tips', async () => {
    const older = Commits.of([
      { hash: 'c1', parents: ['c0'] },
      { hash: 'c0', parents: [] },
    ]);
    assert.strictEqual(
      await extendedHistory(
        path.resolve('no-such-git'),
        path.resolve('.'),
        older,
        new Set(['c1']),
        new Set(['c0']),
        [],
        new Map(),
      ),
      undefined,
    );
  });
});
