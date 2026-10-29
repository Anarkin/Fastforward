import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { screenMargin } from '../../../../tools/terminal/page/view';

suite('Terminal view', () => {
  test('moves the terminal onto whole device pixels by its margin rather than a transform, which would make the compositor resample its canvas, blurring it', () => {
    const [top, , , left] = screenMargin(14, 43.2, 1.25)
      .split(' ')
      .map((value) => parseFloat(value));
    for (const device of [(14 + left) * 1.25, (43.2 + top) * 1.25]) {
      assert.ok(Math.abs(device - Math.round(device)) < 0.01, String(device));
    }
    assert.strictEqual(screenMargin(14, 43, 1), '0px 0 0 0px');
  });
});
