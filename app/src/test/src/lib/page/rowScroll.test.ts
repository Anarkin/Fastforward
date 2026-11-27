import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  revealGlides,
  rowPadding,
  snappedTop,
} from '../../../../lib/page/rowScroll';

suite('Scrolling by whole rows', () => {
  test('snaps a place between rows to the start of the next row, never past the end', () => {
    assert.strictEqual(snappedTop(0, 16.8, 1000), 0);
    assert.strictEqual(snappedTop(33.6, 16.8, 1000), 33.6);
    assert.strictEqual(snappedTop(20, 16.8, 1000), 33.6);
    assert.ok(Math.abs(snappedTop(33.59, 16.8, 1000) - 33.6) < 1e-9);
    assert.strictEqual(snappedTop(995, 16.8, 1000), 1000);
  });

  test('pads the end of a list by what is left of a row at the bottom of the view, so its last place starts on a row', () => {
    assert.strictEqual(rowPadding(100, 20), 0);
    assert.strictEqual(rowPadding(110, 20), 10);
    assert.ok(Math.abs(rowPadding(500, 16.8) - 12.8) < 1e-9);
  });

  test('glides to a row revealed without a key more than a row and at most a view away, and jumps a row or far, as a click on a row half in view and finding do, a row revealed by a key gliding however far it is', () => {
    assert.strictEqual(revealGlides(0, 380, 20, 400), true);
    assert.strictEqual(revealGlides(380, 0, 20, 400), true);
    assert.strictEqual(revealGlides(0, 400, 20, 400), true);
    assert.strictEqual(revealGlides(0, 20, 20, 400), false);
    assert.strictEqual(revealGlides(0, 8, 20, 400), false);
    assert.strictEqual(revealGlides(0, 4000, 20, 400), false);
  });
});
