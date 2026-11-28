import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  byteAtRows,
  lineScaleOf,
  rowsAt,
  rowsOfLine,
} from '../../../../../tools/viewer/page/lineScale';
import {
  rowBytes,
  wholeLineBytes,
} from '../../../../../tools/viewer/shared/protocol';

suite('Scale of the rows of a file by where its lines start', () => {
  test('counts a line as a row while lines are not wrapped, but for one past 64 KiB, which is cut into rows of 4 KiB, and as many rows as its characters fill at the width wrapped to, two bytes a character in UTF-16', () => {
    const unwrapped = rowsOfLine(undefined, 1);
    assert.strictEqual(unwrapped(0), 1);
    assert.strictEqual(unwrapped(500), 1);
    assert.strictEqual(unwrapped(wholeLineBytes), 1);
    assert.strictEqual(
      unwrapped(wholeLineBytes + 1),
      Math.ceil((wholeLineBytes + 1) / rowBytes),
    );
    const wrapped = rowsOfLine(10, 1);
    assert.strictEqual(wrapped(0), 1);
    assert.strictEqual(wrapped(10), 1);
    assert.strictEqual(wrapped(25), 3);
    assert.strictEqual(rowsOfLine(10, 2)(40), 2);
  });

  test('tells how many rows lie above a byte, its line counted by the share of it above the byte, and the byte as many rows down, so a long line and a blank one each take the rows they show in', () => {
    const scale = lineScaleOf([0, 1, 100, 101, 200], 300, rowsOfLine(10, 1));
    assert.strictEqual(rowsAt(scale, 0), 0);
    assert.strictEqual(rowsAt(scale, 1), 1);
    assert.strictEqual(rowsAt(scale, 100), 11);
    assert.strictEqual(rowsAt(scale, 101), 12);
    assert.strictEqual(rowsAt(scale, 150.5), 17);
    assert.strictEqual(rowsAt(scale, 300), 32);
    for (const rows of [0, 0.5, 1, 6, 11.5, 17, 31.9]) {
      assert.ok(
        Math.abs(rowsAt(scale, byteAtRows(scale, rows)) - rows) < 1e-9,
        String(rows),
      );
    }
    assert.strictEqual(byteAtRows(scale, -1), 0);
    assert.strictEqual(byteAtRows(scale, 99), 300);
  });

  test('starts the rows of a file of UTF-8 after its byte order mark, as its first line starts there', () => {
    const scale = lineScaleOf([3, 5], 7, rowsOfLine(undefined, 1));
    assert.strictEqual(rowsAt(scale, 3), 0);
    assert.strictEqual(rowsAt(scale, 0), 0);
    assert.strictEqual(byteAtRows(scale, 0), 3);
    assert.strictEqual(rowsAt(scale, 5), 1);
  });
});
