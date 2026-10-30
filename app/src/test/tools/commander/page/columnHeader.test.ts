import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { draggedWidth } from '../../../../tools/commander/page/columnHeader';
import { maxColumnWidth } from '../../../../tools/commander/shared/settings';

suite('Commander column header', () => {
  test('resizes a column by whole characters as it is dragged, never below one or over the most', () => {
    assert.strictEqual(draggedWidth(10, 7, 0), 10);
    assert.strictEqual(draggedWidth(10, 7, 14), 12);
    assert.strictEqual(draggedWidth(10, 7, 17), 12);
    assert.strictEqual(draggedWidth(10, 7, 18), 13);
    assert.strictEqual(draggedWidth(10, 7, -63), 1);
    assert.strictEqual(draggedWidth(10, 7, -700), 1);
    assert.strictEqual(draggedWidth(10, 7, 7000), maxColumnWidth);
  });
});
