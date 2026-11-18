import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { DiffRow } from '../../../../../components/diff/page/rows';
import {
  rowsAround,
  rowsRoom,
  sameRowInput,
} from '../../../../../components/diff/page/rowContent';

suite('Drawing code', () => {
  test('draws the rows around those in view for as far as the view is tall, however many lines each wraps onto, and one row each way at least, as thirty rows each way of long wrapped lines were fourteen screens drawn to show one', () => {
    const shown = { startIndex: 10, endIndex: 12, count: 100 };
    assert.deepStrictEqual(
      rowsAround(shown, () => 20, 60),
      [7, 8, 9, 10, 11, 12, 13, 14, 15],
    );
    assert.deepStrictEqual(
      rowsAround(shown, () => 500, 60),
      [9, 10, 11, 12, 13],
    );
    assert.deepStrictEqual(
      rowsAround(shown, (index) => (index < 10 ? 25 : 100), 60),
      [7, 8, 9, 10, 11, 12, 13],
    );
    assert.deepStrictEqual(
      rowsAround({ startIndex: 0, endIndex: 1, count: 3 }, () => 20, 600),
      [0, 1, 2],
    );
    assert.deepStrictEqual(
      rowsAround({ startIndex: 0, endIndex: 0, count: 0 }, () => 20, 600),
      [],
    );
  });

  test('draws only one row beyond those in view while the diff is dragged by its scrollbar, enough for it to snap to whole lines, as a drag jumps past more, and drawing them made every step of it slow, but the wheel and keys scroll into a view of rows each way', () => {
    assert.strictEqual(rowsRoom(true, 700), 0);
    assert.strictEqual(rowsRoom(false, 700), 700);
    assert.deepStrictEqual(
      rowsAround(
        { startIndex: 10, endIndex: 12, count: 100 },
        () => 20,
        rowsRoom(true, 700),
      ),
      [9, 10, 11, 12, 13],
    );
  });

  test('draws a row anew only once the row or what it is drawn from changed, not on every scroll of the diff, as drawing every row shown on every step of a drag made dragging the scrollbar of a large diff slow', () => {
    const row: DiffRow = { kind: 'hunk', file: 0 };
    const words = new Map();
    const drawn = (inputs: readonly unknown[], index = 3, shown = row) => ({
      row: shown,
      index,
      inputs,
      render: () => null,
    });

    assert.ok(sameRowInput(drawn([words, 17]), drawn([words, 17])));
    assert.ok(!sameRowInput(drawn([words, 17]), drawn([new Map(), 17])));
    assert.ok(!sameRowInput(drawn([words, 17]), drawn([words, 18])));
    assert.ok(!sameRowInput(drawn([words, 17]), drawn([words, 17], 4)));
    assert.ok(
      !sameRowInput(drawn([words, 17]), drawn([words, 17], 3, { ...row })),
    );
  });
});
