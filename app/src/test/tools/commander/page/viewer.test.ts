import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  bytesPerRow,
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

  test('sizes the thumb by the rows on screen among all the rows of a file read whole, and places it by the rows above', () => {
    assert.deepStrictEqual(
      textThumb({ rows: rows(100), top: 0 }, 10, 1000, 10),
      {
        start: 0,
        length: 0.1,
      },
    );
    assert.deepStrictEqual(
      textThumb({ rows: rows(100), top: 45 }, 10, 1000, 10),
      {
        start: 0.5,
        length: 0.1,
      },
    );
    assert.deepStrictEqual(
      textThumb({ rows: rows(100), top: 90 }, 10, 1000, 10),
      {
        start: 1,
        length: 0.1,
      },
    );
    assert.strictEqual(textThumb({ rows: [], top: 0 }, 10, 0, 10), undefined);
  });

  test('keeps the thumb of a file read in parts as long wherever it is, however long its rows there, and places it by the bytes above, at the end once the last row shows', () => {
    const short = rows(30, 10).map((row) => ({
      ...row,
      start: row.start + 5000,
      end: row.end + 5000,
    }));
    const long = rows(30, 300).map((row) => ({
      ...row,
      start: row.start + 50_000,
      end: row.end + 50_000,
    }));
    const size = 100_000;
    const atShort = textThumb({ rows: short, top: 0 }, 10, size, 20);
    const atLong = textThumb({ rows: long, top: 0 }, 10, size, 20);
    assert.strictEqual(atShort?.length, atLong?.length);
    assert.strictEqual(atShort?.length, 10 / (size / 20));
    assert.strictEqual(atShort?.start, 5000 / size);
    assert.strictEqual(atLong?.start, 50_000 / size);
    const end = rows(30, 10).map((row) => ({
      ...row,
      start: row.start + size - 300,
      end: row.end + size - 300,
    }));
    assert.strictEqual(
      textThumb({ rows: end, top: 20 }, 10, size, 20)?.start,
      1,
    );
  });

  test('sizes and places the thumb of a file counted by its rows, each row moving it as far, and ends it at the last row', () => {
    const window = rows(30, 10).map((row) => ({
      ...row,
      start: row.start + 5000,
      end: row.end + 5000,
    }));
    const counted = (top: number, index: number) =>
      textThumb({ rows: window, top, index }, 10, 100_000, 20, 1010);
    assert.deepStrictEqual(counted(0, 500), { start: 0.5, length: 10 / 1010 });
    assert.deepStrictEqual(counted(1, 500), {
      start: 0.501,
      length: 10 / 1010,
    });
    assert.deepStrictEqual(counted(20, 980), { start: 1, length: 10 / 1010 });
    assert.deepStrictEqual(counted(0, 0), { start: 0, length: 10 / 1010 });
  });

  test('takes the bytes a row has for the rows first read, to size the thumb by', () => {
    assert.strictEqual(bytesPerRow(rows(30, 10)), 10);
    assert.strictEqual(bytesPerRow([]), undefined);
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
