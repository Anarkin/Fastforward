import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { withoutWhere, withRecent } from '../../../../lib/page/recentPlaces';

suite('recent places', () => {
  test('keeps the places kept last, dropping the oldest beyond the most it holds', () => {
    let places: ReadonlyMap<string, number> = new Map();
    places = withRecent(places, 'one', 1, 2);
    places = withRecent(places, 'two', 2, 2);
    places = withRecent(places, 'one', 10, 2);
    places = withRecent(places, 'three', 3, 2);
    assert.deepStrictEqual(
      [...places],
      [
        ['one', 10],
        ['three', 3],
      ],
    );
  });

  test('forgets a place kept as undefined, and returns the same map when nothing changes', () => {
    const places = withRecent(new Map(), 'one', 1);
    assert.strictEqual(withRecent(places, 'one', 1), places);
    assert.strictEqual(withRecent(places, 'two', undefined), places);
    assert.deepStrictEqual([...withRecent(places, 'one', undefined)], []);
  });

  test('drops the places whose keys match, returning the same map when none do', () => {
    const places = new Map([
      ['a1', 1],
      ['b1', 2],
    ]);
    assert.strictEqual(
      withoutWhere(places, (key) => key.startsWith('c')),
      places,
    );
    assert.deepStrictEqual(
      [...withoutWhere(places, (key) => key.startsWith('a'))],
      [['b1', 2]],
    );
  });
});
