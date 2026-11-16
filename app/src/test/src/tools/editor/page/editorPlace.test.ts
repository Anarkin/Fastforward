import { assert, test } from 'vitest';
import {
  placeIn,
  placeMapped,
  samePlace,
} from '../../../../../tools/editor/page/editorPlace';
import { ChangeSet } from '@codemirror/state';

test('reads the place scrolled to from the state kept, and nothing from a state without one or with one of other values', () => {
  assert.deepStrictEqual(
    placeIn({ selection: {}, place: { from: 120, offset: 38 } }),
    { from: 120, offset: 38 },
  );
  for (const kept of [
    undefined,
    null,
    'place',
    { selection: {} },
    { place: { from: '120', offset: 38 } },
    { place: { from: 120 } },
    { place: { from: Number.NaN, offset: 0 } },
    { place: { from: -1, offset: 0 } },
  ]) {
    assert.strictEqual(placeIn(kept), undefined);
  }
});

test('moves the place scrolled to with the text typed above it, and keeps it where the text changed below', () => {
  const place = { from: 10, offset: 4 };
  assert.deepStrictEqual(
    placeMapped(place, ChangeSet.of({ from: 2, insert: 'abc' }, 30)),
    { from: 13, offset: 4 },
  );
  assert.deepStrictEqual(
    placeMapped(place, ChangeSet.of({ from: 20, insert: 'abc' }, 30)),
    place,
  );
});

test('takes the place scrolled to as reached within a pixel of it, and not at another start or a row away', () => {
  assert.isTrue(
    samePlace({ from: 120, offset: 0 }, { from: 120, offset: 0.4 }),
  );
  assert.isFalse(samePlace({ from: 120, offset: 0 }, { from: 121, offset: 0 }));
  assert.isFalse(
    samePlace({ from: 120, offset: 17.6 }, { from: 120, offset: 0 }),
  );
});

test('reads how far the text was scrolled sideways from the state kept, as a line longer than the editor came back at its start', () => {
  assert.deepStrictEqual(
    placeIn({ place: { from: 120, offset: 38, left: 240 } }),
    { from: 120, offset: 38, left: 240 },
  );
  for (const left of [0, -5, '240', Number.NaN]) {
    assert.deepStrictEqual(
      placeIn({ place: { from: 120, offset: 38, left } }),
      { from: 120, offset: 38 },
    );
  }
});
