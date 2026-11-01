import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  scrolled,
  textThumb,
  topWithin,
} from '../../../../tools/commander/page/textBody';
import { thumbBox } from '../../../../tools/commander/page/scrollBody';

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

  test('sizes the thumb by the share of the bytes on screen, and places it by the share of the bytes before them', () => {
    assert.deepStrictEqual(textThumb({ rows: rows(100), top: 0 }, 10, 1000), {
      start: 0,
      length: 0.1,
    });
    assert.deepStrictEqual(textThumb({ rows: rows(100), top: 90 }, 10, 1000), {
      start: 1,
      length: 0.1,
    });
    assert.strictEqual(textThumb({ rows: [], top: 0 }, 10, 0), undefined);
  });

  test('draws the thumb never smaller than it can be grabbed, in the room the track leaves it', () => {
    assert.deepStrictEqual(thumbBox({ start: 0.5, length: 0.1 }, 500), {
      top: 225,
      height: 50,
    });
    assert.deepStrictEqual(thumbBox({ start: 1, length: 1e-9 }, 500), {
      top: 476,
      height: 24,
    });
  });

  test('scrolls within the rows loaded at once, asking for more near their edges, and only past them waits for the file', () => {
    const middle = {
      rows: rows(100, 10).map((row) => ({
        ...row,
        start: row.start + 5000,
        end: row.end + 5000,
      })),
      top: 40,
    };
    assert.deepStrictEqual(scrolled(middle, 3, 10, 1_000_000), {
      top: 43,
      refill: false,
    });
    assert.deepStrictEqual(scrolled(middle, -35, 10, 1_000_000), {
      top: 5,
      refill: true,
    });
    assert.deepStrictEqual(scrolled(middle, 45, 10, 1_000_000), {
      top: 85,
      refill: true,
    });
    assert.strictEqual(scrolled(middle, 60, 10, 1_000_000), undefined);
    assert.strictEqual(scrolled(middle, -41, 10, 1_000_000), undefined);
  });

  test('stops at the start and the end of the file, asking for nothing there', () => {
    const whole = { rows: rows(30), top: 2 };
    assert.deepStrictEqual(scrolled(whole, -5, 10, 300), {
      top: 0,
      refill: false,
    });
    assert.deepStrictEqual(scrolled(whole, 50, 10, 300), {
      top: 20,
      refill: false,
    });
    assert.strictEqual(scrolled({ rows: [], top: 0 }, 1, 10, 0), undefined);
  });
});
