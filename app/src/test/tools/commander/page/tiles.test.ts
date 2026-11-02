import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  moveInGrid,
  tileColumns,
} from '../../../../tools/commander/page/tiles';

const visible = { first: 0, last: 2 };

suite('Thumbnails of a side', () => {
  test('fits as many whole tiles across as the side is wide, and one at least', () => {
    assert.strictEqual(tileColumns(1000, 208), 4);
    assert.strictEqual(tileColumns(832, 208), 4);
    assert.strictEqual(tileColumns(831, 208), 3);
    assert.strictEqual(tileColumns(100, 208), 1);
    assert.strictEqual(tileColumns(0, 208), 1);
  });

  test('moves to the tile above or below in the same column, staying put at the top, and to the last tile when the row below is short', () => {
    assert.strictEqual(moveInGrid('down', 1, 10, 4, visible), 5);
    assert.strictEqual(moveInGrid('up', 5, 10, 4, visible), 1);
    assert.strictEqual(moveInGrid('up', 2, 10, 4, visible), undefined);
    assert.strictEqual(moveInGrid('down', 7, 10, 4, visible), 9);
    assert.strictEqual(moveInGrid('down', 9, 10, 4, visible), undefined);
    assert.strictEqual(moveInGrid('down', 5, 10, 4, visible), 9);
  });

  test('moves to the tile on the left or right, going on to the next row at the end of one and back to the previous at its start, but not past the ends', () => {
    assert.strictEqual(moveInGrid('right', 1, 10, 4, visible), 2);
    assert.strictEqual(moveInGrid('right', 3, 10, 4, visible), 4);
    assert.strictEqual(moveInGrid('left', 4, 10, 4, visible), 3);
    assert.strictEqual(moveInGrid('left', 0, 10, 4, visible), undefined);
    assert.strictEqual(moveInGrid('right', 9, 10, 4, visible), undefined);
  });

  test('moves a screen of rows in the same column with PgDn and PgUp, first to the last or first row shown, and to the first or last tile with Home and End', () => {
    const many = 40;
    assert.strictEqual(moveInGrid('pageDown', 1, many, 4, visible), 9);
    assert.strictEqual(moveInGrid('pageDown', 9, many, 4, visible), 17);
    assert.strictEqual(moveInGrid('pageDown', 37, many, 4, visible), 39);
    assert.strictEqual(
      moveInGrid('pageUp', 17, many, 4, { first: 4, last: 6 }),
      9,
    );
    assert.strictEqual(
      moveInGrid('pageUp', 25, many, 4, { first: 4, last: 6 }),
      17,
    );
    assert.strictEqual(moveInGrid('pageUp', 6, many, 4, visible), 2);
    assert.strictEqual(moveInGrid('first', 6, many, 4, visible), 0);
    assert.strictEqual(moveInGrid('last', 6, many, 4, visible), 39);
  });

  test('starts at the first tile when none is selected, and moves nowhere among none', () => {
    assert.strictEqual(moveInGrid('right', undefined, 10, 4, visible), 0);
    assert.strictEqual(moveInGrid('down', undefined, 10, 4, visible), 0);
    assert.strictEqual(moveInGrid('down', undefined, 0, 4, visible), undefined);
  });
});
