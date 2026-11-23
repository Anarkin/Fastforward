import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { dotLook, fontDotLook } from '../../../../lib/page/dotLook';

suite('The dots of spaces', () => {
  test('takes the size of a dot from the size of the font a row is drawn in, and gives none while the font or the advance of its characters is not known yet', () => {
    assert.deepStrictEqual(
      fontDotLook('normal 400 12px "JetBrains Mono", monospace', 7.2, 0.8),
      dotLook(12, 7.2, 0.8),
    );
    assert.strictEqual(fontDotLook('', 7.2, 0.8), undefined);
    assert.strictEqual(
      fontDotLook('normal 400 12px monospace', 0, 0.8),
      undefined,
    );
  });

  test('starts a dot in the middle of its column, on a whole device pixel, though the advance measured is a hair short of whole device pixels, as a column of 11 device pixels at 150% measured over a row of characters came millionths short and its dot of 3 started on the third pixel in a file viewed and on the fourth in the same file edited', () => {
    const pixel = 1 / 1.5;
    assert.deepStrictEqual(
      [7.333328, 11 * pixel, 7.33334].map((advance) =>
        Math.round(dotLook(14, advance, pixel).start / pixel),
      ),
      [4, 4, 4],
    );
  });
});
