import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { dotLook } from '../../../../../lib/page/dotLook';
import {
  dotBoxOf,
  rasterBudget,
} from '../../../../../tools/viewer/page/cellView';

suite('View of cells', () => {
  test('draws the dot of a space where the stylesheet draws it, on whole device pixels at every scale, in the middle of its row', () => {
    assert.deepStrictEqual(dotBoxOf(dotLook(12, 7, 1), 1, 18), {
      size: 2,
      left: 2,
      top: 8,
      hairline: 1,
    });
    assert.deepStrictEqual(dotBoxOf(dotLook(12, 7.2, 0.8), 1.25, 23), {
      size: 2,
      left: 3,
      top: 10,
      hairline: 1,
    });
    assert.deepStrictEqual(dotBoxOf(undefined, 1, 18), {
      size: 1,
      left: 0,
      top: 8,
      hairline: 1,
    });
    assert.strictEqual(dotBoxOf(undefined, 2, 36).hairline, 2);
  });

  test('gives a frame little time for new glyphs while the rows keep changing, so scrolling stays smooth, and plenty once they rested, so a text opened is drawn whole at once', () => {
    assert.strictEqual(rasterBudget(8, true, 50), 2);
    assert.strictEqual(rasterBudget(400, true, 2), 50);
  });

  test('keeps the time a frame has while the same rows are drawn again, as a frame finishing the one before it', () => {
    assert.strictEqual(rasterBudget(8, false, 50), 50);
    assert.strictEqual(rasterBudget(400, false, 2), 2);
  });
});
