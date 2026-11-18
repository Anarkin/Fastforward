import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { glideAt } from '../../../../lib/page/glide';
import {
  glideRows,
  revealGlides,
  rowGlide,
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

  test('glides to the row it aims at in a moment, easing out, and from where it is on to a new aim, ending on the row', () => {
    const glide = glideRows(undefined, 0, 1000, 200);
    assert.strictEqual(glideAt(glide, 1000), 0);
    const halfway = glideAt(glide, 1000 + rowGlide / 2);
    assert.ok(halfway > 100 && halfway < 200, String(halfway));
    assert.strictEqual(glideAt(glide, 1000 + rowGlide), 200);
    const further = glideRows(glide, 50, 1000 + rowGlide / 2, 400);
    assert.strictEqual(glideAt(further, 1000 + rowGlide / 2), halfway);
    assert.strictEqual(glideAt(further, 1000 + rowGlide * 1.5), 400);
  });

  test('glides to a row revealed without a key more than a row and at most a view away, and jumps a row or far, as a click on a row half in view and finding do, a row revealed by a key gliding however far it is', () => {
    assert.strictEqual(revealGlides(0, 380, 20, 400), true);
    assert.strictEqual(revealGlides(380, 0, 20, 400), true);
    assert.strictEqual(revealGlides(0, 400, 20, 400), true);
    assert.strictEqual(revealGlides(0, 20, 20, 400), false);
    assert.strictEqual(revealGlides(0, 8, 20, 400), false);
    assert.strictEqual(revealGlides(0, 4000, 20, 400), false);
  });

  test('spreads a glide over its frames, never moving more than a quarter of the way in one frame of a display at 60 Hz, as most of it in the first frame looks like a jump that then lags', () => {
    const glide = glideRows(undefined, 0, 0, 1000);
    const frame = 1000 / 60;
    let place = 0;
    for (let time = frame; time < rowGlide + frame; time += frame) {
      const next = glideAt(glide, time);
      assert.ok(next - place <= 250, `${next - place} at ${time}`);
      place = next;
    }
    assert.strictEqual(place, 1000);
  });
});
