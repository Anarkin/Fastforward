import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  bytesPerRow,
  draggedTo,
  jumpedWithin,
  scrolled,
  textEnds,
  textThumb,
  topWithin,
} from '../../../../../tools/viewer/page/textScroll';
import {
  lineScaleOf,
  rowsOfLine,
} from '../../../../../tools/viewer/page/lineScale';

function unevenLines(): { readonly starts: number[]; readonly size: number } {
  const starts: number[] = [];
  let at = 0;
  for (let index = 0; index < 100; index++) {
    starts.push(at);
    at += index % 2 === 0 ? 1 : 99;
  }
  return { starts, size: at };
}

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

  test('places the thumb by the bytes above the top row among those above the last screen, so it ends where the last screen shows, and sizes it by the rows on screen among the rows the bytes of the file make', () => {
    assert.deepStrictEqual(
      textThumb({ rows: rows(100), top: 0 }, 10, 1000, 10, 900),
      { start: 0, length: 0.1 },
    );
    assert.deepStrictEqual(
      textThumb({ rows: rows(100), top: 45 }, 10, 1000, 10, 900),
      { start: 0.5, length: 0.1 },
    );
    assert.deepStrictEqual(
      textThumb({ rows: rows(100), top: 90 }, 10, 1000, 10, 900),
      { start: 1, length: 0.1 },
    );
    assert.strictEqual(
      textThumb({ rows: [], top: 0 }, 10, 0, 10, undefined),
      undefined,
    );
  });

  test('takes the row the text opens with after a byte order mark for the top of the file, putting the thumb at the very top and scrolling no further up, as a row starting past byte 0 passed for one with more above it', () => {
    const marked = rows(100).map((row, index) => ({
      ...row,
      start: row.start + 3,
      end: row.end + 3,
      ...(index === 0 && { opensText: true as const }),
    }));
    assert.deepStrictEqual(
      textThumb({ rows: marked, top: 0 }, 10, 1003, 10, 903),
      { start: 0, length: 10 / (1003 / 10) },
    );
    assert.deepStrictEqual(textEnds({ rows: marked, top: 0 }, 10, 1003), {
      atStart: true,
      atEnd: false,
    });
    assert.deepStrictEqual(scrolled({ rows: marked, top: 0 }, -1, 10, 1003), {
      top: 0,
      refill: false,
    });
    assert.deepStrictEqual(
      jumpedWithin({ rows: marked, top: 0 }, 3, 10, 1003),
      { row: 0, top: 0, refill: false },
    );
  });

  test('knows the first and the last screen of a file from the rows read, rather than from where the thumb is reckoned to be, a file that fits its view at both at once, and one with no rows read yet too, so nothing is moved where no row is left to move to', () => {
    const middle = rows(30).map((row) => ({
      ...row,
      start: row.start + 5000,
      end: row.end + 5000,
    }));
    assert.deepStrictEqual(
      [
        textEnds({ rows: rows(100), top: 0 }, 10, 1000),
        textEnds({ rows: rows(100), top: 45 }, 10, 1000),
        textEnds({ rows: rows(100), top: 90 }, 10, 1000),
        textEnds({ rows: middle, top: 0 }, 10, 100_000),
        textEnds({ rows: middle, top: 20 }, 10, 100_000),
        textEnds({ rows: rows(5), top: 0 }, 10, 50),
        textEnds({ rows: [], top: 0 }, 10, 0),
      ],
      [
        { atStart: true, atEnd: false },
        { atStart: false, atEnd: false },
        { atStart: false, atEnd: true },
        { atStart: false, atEnd: false },
        { atStart: false, atEnd: false },
        { atStart: true, atEnd: true },
        { atStart: true, atEnd: true },
      ],
    );
  });

  test('draws no thumb for a file that fits its view, as one as long as the view showed for a file with nothing to scroll', () => {
    assert.strictEqual(
      textThumb({ rows: rows(5), top: 0 }, 10, 50, 10, 0),
      undefined,
    );
    assert.strictEqual(
      textThumb({ rows: rows(10), top: 0 }, 10, 100, 10, undefined),
      undefined,
    );
    assert.deepStrictEqual(
      textThumb({ rows: rows(11), top: 0 }, 10, 110, 10, 10),
      { start: 0, length: 10 / 11 },
    );
  });

  test('keeps the thumb of a file read in parts as long wherever it is, however long its rows there, and reckons where the last screen starts until it is told', () => {
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
    const atShort = textThumb({ rows: short, top: 0 }, 10, size, 20, 98_000);
    const atLong = textThumb({ rows: long, top: 0 }, 10, size, 20, 98_000);
    assert.strictEqual(atShort?.length, atLong?.length);
    assert.strictEqual(atShort?.length, 10 / (size / 20));
    assert.strictEqual(atShort?.start, 5000 / 98_000);
    assert.strictEqual(atLong?.start, 50_000 / 98_000);
    assert.strictEqual(
      textThumb({ rows: short, top: 0 }, 10, size, 20, undefined)?.start,
      5000 / (size - 10 * 20),
    );
  });

  test('places and sizes the thumb of a file whose lines it knows by the rows above the top row among the rows above the last screen, however few of its rows are read, so a file of long lines and blank ones scrolls as evenly as the editor scrolls it', () => {
    const { starts, size } = unevenLines();
    const scale = lineScaleOf(starts, size, rowsOfLine(undefined, 1));
    const read = Array.from({ length: 20 }, (_, index) => ({
      start: starts[40 + index] ?? 0,
      end: starts[41 + index] ?? size,
    }));
    const lastTop = starts[90];
    assert.deepStrictEqual(
      textThumb({ rows: read, top: 5 }, 10, size, 50, lastTop, scale),
      { start: 0.5, length: 0.1 },
    );
    assert.deepStrictEqual(
      textThumb({ rows: read, top: 5 }, 10, size, 50, undefined, scale),
      { start: 0.5, length: 0.1 },
    );
    assert.deepStrictEqual(
      textThumb({ rows: read, top: 5 }, 10, size + 1, 50, lastTop, scale)
        ?.start,
      (starts[45] ?? 0) / (lastTop ?? 0),
    );
  });

  test('lands a drag of the thumb of a file whose lines it knows on the byte as far through its rows as the thumb is through its track, and that of a file it knows no lines of on the byte as far through its bytes', () => {
    const { starts, size } = unevenLines();
    const scale = lineScaleOf(starts, size, rowsOfLine(undefined, 1));
    const lastTop = starts[90];
    assert.strictEqual(
      draggedTo(0.5, 10, size, 50, lastTop, scale),
      starts[45],
    );
    const between = draggedTo(0.505, 10, size, 50, lastTop, scale);
    assert.ok(
      between > (starts[45] ?? 0) && between < (starts[46] ?? 0),
      String(between),
    );
    assert.strictEqual(draggedTo(1, 10, size, 50, lastTop, scale), lastTop);
    assert.strictEqual(
      draggedTo(0.5, 10, size, 50, lastTop, undefined),
      Math.round((lastTop ?? 0) / 2),
    );
  });

  test('takes the bytes a row has for the rows first read, to size the thumb by', () => {
    assert.strictEqual(bytesPerRow(rows(30, 10)), 10);
    assert.strictEqual(bytesPerRow([]), undefined);
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

  test('finds the row a byte of the file is in among the rows held, with a screen of rows from it, so a jump there is shown at once rather than after the main process has read around it, as each step of a scrollbar dragged waited for its rows, a frame or two behind the pointer, while the editor moved with it', () => {
    const middle = {
      rows: Array.from({ length: 100 }, (_, index) => ({
        start: 5000 + index * 10,
        end: 5000 + (index + 1) * 10,
      })),
      top: 40,
    };
    assert.deepStrictEqual(jumpedWithin(middle, 5503, 10, 1_000_000), {
      row: 50,
      top: 50,
      refill: false,
    });
    assert.deepStrictEqual(jumpedWithin(middle, 5000, 10, 1_000_000), {
      row: 0,
      top: 0,
      refill: true,
    });
    assert.deepStrictEqual(jumpedWithin(middle, 5859, 10, 1_000_000), {
      row: 85,
      top: 85,
      refill: true,
    });
    assert.strictEqual(jumpedWithin(middle, 5910, 10, 1_000_000), undefined);
    assert.strictEqual(jumpedWithin(middle, 4999, 10, 1_000_000), undefined);
    assert.strictEqual(jumpedWithin(middle, 6000, 10, 1_000_000), undefined);
    assert.strictEqual(jumpedWithin({ rows: [], top: 0 }, 0, 10, 0), undefined);
  });

  test('keeps a screen full of rows where a jump lands in the last rows of the file, and takes a byte past its last row for that row, asking for nothing at either end', () => {
    const whole = { rows: rows(30), top: 2 };
    assert.deepStrictEqual(jumpedWithin(whole, 255, 10, 300), {
      row: 25,
      top: 20,
      refill: false,
    });
    assert.deepStrictEqual(jumpedWithin(whole, 300, 10, 300), {
      row: 29,
      top: 20,
      refill: false,
    });
    assert.deepStrictEqual(jumpedWithin(whole, 0, 10, 300), {
      row: 0,
      top: 0,
      refill: false,
    });
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
