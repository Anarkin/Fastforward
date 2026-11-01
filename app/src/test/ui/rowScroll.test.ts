import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { rowPadding, snappedTop, wheelRows } from '../../ui/rowScroll';

suite('Scrolling by whole rows', () => {
  test('snaps a place between rows to the start of the next row, never past the end', () => {
    assert.strictEqual(snappedTop(0, 16.8, 1000), 0);
    assert.strictEqual(snappedTop(33.6, 16.8, 1000), 33.6);
    assert.strictEqual(snappedTop(20, 16.8, 1000), 33.6);
    assert.ok(Math.abs(snappedTop(33.59, 16.8, 1000) - 33.6) < 1e-9);
    assert.strictEqual(snappedTop(995, 16.8, 1000), 1000);
  });

  test('turns the wheel into whole rows, keeping what is left for the next turn, lines and pages too', () => {
    assert.deepStrictEqual(wheelRows(0, 100, 0, 20, 400), {
      rows: 5,
      pending: 0,
    });
    assert.deepStrictEqual(wheelRows(0, 30, 0, 20, 400), {
      rows: 1,
      pending: 10,
    });
    assert.deepStrictEqual(wheelRows(10, 10, 0, 20, 400), {
      rows: 1,
      pending: 0,
    });
    assert.deepStrictEqual(wheelRows(0, -45, 0, 20, 400), {
      rows: -2,
      pending: -5,
    });
    assert.deepStrictEqual(wheelRows(0, 3, 1, 20, 400), {
      rows: 3,
      pending: 0,
    });
    assert.deepStrictEqual(wheelRows(0, 1, 2, 20, 400), {
      rows: 20,
      pending: 0,
    });
  });

  test('pads the end of a list by what is left of a row at the bottom of the view, so its last place starts on a row', () => {
    assert.strictEqual(rowPadding(100, 20), 0);
    assert.strictEqual(rowPadding(110, 20), 10);
    assert.ok(Math.abs(rowPadding(500, 16.8) - 12.8) < 1e-9);
  });
});
