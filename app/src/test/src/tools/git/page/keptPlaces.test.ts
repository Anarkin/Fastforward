import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { KeptPlaces } from '../../../../../tools/git/page/keptPlaces';

suite('Kept places', () => {
  test('keeps a place by its key, forgetting the one kept longest ago beyond its limit', () => {
    const places = new KeptPlaces<number>(2);
    places.keep('one', 1);
    places.keep('two', 2);
    places.keep('one', 10);
    places.keep('three', 3);
    assert.deepStrictEqual(
      [places.of('one'), places.of('two'), places.of('three')],
      [10, undefined, 3],
    );
  });

  test('tells of the key of every place kept, forgotten or let go beyond its limit, so what keeps them sends them', () => {
    const changed: string[] = [];
    const places = new KeptPlaces<number>(1, (key) => changed.push(key));
    places.keep('one', 1);
    places.keep('two', 2);
    places.forget('two');
    places.forget('two');
    assert.deepStrictEqual(changed, ['one', 'two', 'one', 'two']);
  });
});
