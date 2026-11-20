import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  endPaddingToStart,
  snappedToStart,
  startsBelowCover,
} from '../../../../lib/page/rowStarts';

const starts = [0, 18, 54, 90, 144, 180];
const startOf = (index: number) => starts[index];
const count = starts.length;

suite('Row starts', () => {
  test('stops a scroll on the start of a row, the next one going down and the one before going up, as rows of a list may be one, two or three lines tall', () => {
    assert.strictEqual(snappedToStart(startOf, count, 60, 1, 1000), 90);
    assert.strictEqual(snappedToStart(startOf, count, 60, -1, 1000), 54);
    assert.strictEqual(snappedToStart(startOf, count, 60, 0, 1000), 90);
    assert.strictEqual(snappedToStart(startOf, count, 54.004, 0, 1000), 54);
    assert.strictEqual(snappedToStart(startOf, count, 0, -1, 1000), 0);
  });

  test('stops at the end of the list going down past the start of its last row once that row is taller than the list, as no row starts below it, and at the start of that row going up, as the commit list went back to the start of a last commit whose labels ran below the list and never reached the end of its scrollbar, its last button drawn as one that scrolls', () => {
    assert.strictEqual(snappedToStart(startOf, count, 500, 1, 1000), 1000);
    assert.strictEqual(snappedToStart(startOf, count, 500, 0, 1000), 1000);
    assert.strictEqual(snappedToStart(startOf, count, 500, -1, 1000), 180);
    assert.strictEqual(snappedToStart(startOf, count, 1000, -1, 1000), 180);
    assert.strictEqual(snappedToStart(startOf, count, 180.005, 1, 1000), 180);
  });

  test('never stops past the end of the list', () => {
    assert.strictEqual(snappedToStart(startOf, count, 170, 1, 150), 150);
    assert.strictEqual(snappedToStart(startOf, count, -20, 0, 150), 0);
  });

  test('takes a place as near a start as it is told for that start, so a list the browser scrolls by whole pixels stays on a row that starts between two', () => {
    const between = [0, 23.96, 47.92];
    const near = (index: number) => between[index];
    assert.strictEqual(snappedToStart(near, 3, 24, 1, 1000, 0.5), 23.96);
    assert.strictEqual(snappedToStart(near, 3, 23.6, -1, 1000, 0.5), 23.96);
    assert.strictEqual(snappedToStart(near, 3, 24, 1, 1000), 47.92);
  });

  test('pads the end of the list by as much as its last place falls short of the start of a row, so the row at the top is whole there too', () => {
    assert.strictEqual(endPaddingToStart(startOf, count, 216, 100), 28);
    assert.strictEqual(endPaddingToStart(startOf, count, 190, 100), 0);
    assert.strictEqual(endPaddingToStart(startOf, count, 80, 100), 0);
  });

  test('starts each row where it shows whole below what stays stuck at the top of the list, as a search box, the first at the top of the list, in order', () => {
    assert.deepStrictEqual(
      startsBelowCover([38, 62, 86, 119], 38),
      [0, 24, 48, 81],
    );
    assert.deepStrictEqual(startsBelowCover([4, 28, 52], 0), [0, 28, 52]);
    assert.deepStrictEqual(
      startsBelowCover([0, 36, 36, 60], 36),
      [0, 0, 0, 24],
    );
    assert.deepStrictEqual(startsBelowCover([], 38), []);
  });
});
