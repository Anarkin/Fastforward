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
});
