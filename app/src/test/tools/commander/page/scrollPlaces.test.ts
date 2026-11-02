import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { ScrollPlaces } from '../../../../tools/commander/page/scrollPlaces';

suite('Scroll places', () => {
  test('remembers where each list was scrolled to, nowhere for one never scrolled', () => {
    const places = new ScrollPlaces();
    places.keep('1 left C:\\ thumbnails', 1683);
    places.keep('1 left C:\\ details', 40);
    assert.strictEqual(places.of('1 left C:\\ thumbnails'), 1683);
    assert.strictEqual(places.of('1 left C:\\ details'), 40);
    assert.strictEqual(places.of('1 right C:\\ details'), 0);
  });

  test('forgets the lists scrolled least lately beyond its limit', () => {
    const places = new ScrollPlaces(2);
    places.keep('a', 1);
    places.keep('b', 2);
    places.keep('a', 3);
    places.keep('c', 4);
    assert.strictEqual(places.of('b'), 0);
    assert.strictEqual(places.of('a'), 3);
    assert.strictEqual(places.of('c'), 4);
  });
});
