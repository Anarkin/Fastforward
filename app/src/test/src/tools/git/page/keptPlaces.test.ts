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
});
