import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { fieldSelection } from '../../../../shell/page/fieldSelection';

suite('Text cursor', () => {
  test('selects text over the row the cursor fills, from the left of the first character to the right of the last, within the box as it scrolls, and draws nothing for no text', () => {
    const line = {
      content: { left: 50, top: 400, width: 100, height: 24 },
      lineHeight: 18,
      scrolled: 0,
    };
    assert.deepStrictEqual(fieldSelection(line, 7.5, 37.5), {
      left: 57.5,
      top: 403,
      width: 30,
      height: 18,
    });
    assert.deepStrictEqual(
      fieldSelection({ ...line, scrolled: 20 }, 7.5, 200),
      { left: 50, top: 403, width: 100, height: 18 },
    );
    assert.strictEqual(fieldSelection(line, 7.5, 7.5), undefined);
    assert.strictEqual(
      fieldSelection({ ...line, scrolled: 300 }, 7.5, 37.5),
      undefined,
    );
  });
});
