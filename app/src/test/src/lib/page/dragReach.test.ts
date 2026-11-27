import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { columnsReached, rowsReached } from '../../../../lib/page/dragReach';

const rowHeight = 18;

suite('Reaching past the edges of a drag', () => {
  test('scrolls a row for every row the pointer is dragged past the top or the bottom, five at most, and none while it is over the text, in the views and the editor alike', () => {
    assert.deepStrictEqual(
      [100, -1, -40, 500, 2000].map((at) => rowsReached(at, 0, 480, rowHeight)),
      [0, -1, -3, 2, 5],
    );
  });

  test('scrolls a column for every column the pointer is dragged past the left or the right, ten at most, and none where a cell has no width', () => {
    assert.deepStrictEqual(
      [50, 0, -15, 260, 900].map((at) => columnsReached(at, 10, 250, 7)),
      [0, -2, -4, 2, 10],
    );
    assert.strictEqual(rowsReached(-40, 0, 480, 0), 0);
  });
});
