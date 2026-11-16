import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  markedRowStarts,
  rowStarts,
} from '../../../../../components/diff/page/diffRowStarts';

suite('Row starts', () => {
  test('finds the first character of each row by where the browser laid the characters out, reading few of them', () => {
    const laidOut = [0, 0, 0, 1, 1, 2];
    assert.deepStrictEqual(
      rowStarts(6, 3, (offset) => laidOut[offset]),
      [0, 3, 5],
    );
    assert.deepStrictEqual(
      rowStarts(3, 1, () => 0),
      [0],
    );
    let reads = 0;
    assert.deepStrictEqual(
      rowStarts(1000, 10, (offset) => {
        reads++;
        return Math.floor(offset / 100);
      }),
      [0, 100, 200, 300, 400, 500, 600, 700, 800, 900],
    );
    assert.ok(reads < 100, `${reads} reads`);
  });

  test('finds the rows of a long line in a few reads each, looking near where the row before would end, as each read asks the browser where a character is', () => {
    let reads = 0;
    const rowOf = (offset: number) => {
      reads++;
      return Math.floor(offset / 70) + (offset % 70 >= 65 ? 1 : 0);
    };
    const starts = rowStarts(14_000, 200, rowOf);
    assert.strictEqual(starts.length, 200);
    assert.deepStrictEqual(starts.slice(0, 3), [0, 65, 135]);
    assert.ok(reads < 200 * 8, `${reads} reads`);
  });

  test('finds where the browser laid out the rows of a line of at most 200 rows, and leaves those of a longer one to the app, reading nothing of it, as reading thousands of rows froze the page', () => {
    let reads = 0;
    const rowOf = (offset: number) => {
      reads++;
      return Math.floor(offset / 10);
    };
    assert.strictEqual(markedRowStarts(2000, 200, rowOf)?.length, 200);
    reads = 0;
    assert.strictEqual(markedRowStarts(2010, 201, rowOf), undefined);
    assert.strictEqual(reads, 0);
  });
});
