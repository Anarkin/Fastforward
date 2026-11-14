import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { clickPairs } from '../../../lib/page/clickPairs';

const paired = (clicks: readonly (readonly [string, number])[]) => {
  const pairs = clickPairs();
  return clicks.map(([key, count]) => pairs(key, count));
};

suite('Click pairs', () => {
  test('pairs the second click of a double click on the same item', () => {
    assert.deepStrictEqual(
      paired([
        ['src', 1],
        ['src', 2],
      ]),
      [false, true],
    );
  });

  test('pairs the third and fourth clicks, as Chromium counts on rather than from 1 when a double click comes right after another at the same spot', () => {
    assert.deepStrictEqual(
      paired([
        ['src', 1],
        ['src', 2],
        ['main', 3],
        ['main', 3],
      ]),
      [false, true, false, true],
    );
    assert.deepStrictEqual(
      paired([
        ['src', 1],
        ['src', 2],
        ['main', 3],
        ['main', 4],
      ]),
      [false, true, false, true],
    );
  });

  test('pairs no clicks on two items, slow clicks, or clicks made by the keyboard', () => {
    assert.deepStrictEqual(
      paired([
        ['src', 1],
        ['main', 2],
      ]),
      [false, false],
    );
    assert.deepStrictEqual(
      paired([
        ['src', 1],
        ['src', 1],
      ]),
      [false, false],
    );
    assert.deepStrictEqual(
      paired([
        ['src', 0],
        ['src', 0],
      ]),
      [false, false],
    );
  });
});
