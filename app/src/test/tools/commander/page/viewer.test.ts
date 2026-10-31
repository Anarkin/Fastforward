import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { thumbOf, topWithin } from '../../../../tools/commander/page/viewer';

const rows = (count: number, length = 10) =>
  Array.from({ length: count }, (_, index) => ({
    start: index * length,
    end: (index + 1) * length,
    text: '',
  }));

suite('Commander viewer', () => {
  test('keeps a screen full of rows at either end of the file', () => {
    assert.strictEqual(topWithin(5, 100, 20), 5);
    assert.strictEqual(topWithin(-3, 100, 20), 0);
    assert.strictEqual(topWithin(95, 100, 20), 80);
    assert.strictEqual(topWithin(4, 10, 20), 0);
  });

  test('sizes and places the thumb by the bytes on screen and before it, never smaller than it can be grabbed', () => {
    const loaded = { rows: rows(100), top: 0 };
    assert.deepStrictEqual(thumbOf(loaded, 10, 1000, 500), {
      top: 0,
      height: 50,
    });
    assert.deepStrictEqual(
      thumbOf({ rows: rows(100), top: 90 }, 10, 1000, 500),
      {
        top: 450,
        height: 50,
      },
    );
    assert.strictEqual(
      thumbOf({ rows: rows(10), top: 0 }, 10, 1_000_000_000, 500).height,
      24,
    );
    assert.deepStrictEqual(thumbOf({ rows: [], top: 0 }, 10, 0, 500), {
      top: 0,
      height: 500,
    });
  });
});
