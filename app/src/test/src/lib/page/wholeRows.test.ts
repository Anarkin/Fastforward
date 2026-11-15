import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { rowStep, startsOfRows } from '../../../../lib/page/wholeRows';

suite('Whole rows', () => {
  test('starts each row at its top within the content scrolled, below as much as the scroll padding of the list says stays stuck at its top', () => {
    assert.deepStrictEqual(
      startsOfRows(
        { top: 100, scrolled: 48, scrollPaddingTop: '38px' },
        [90, 114, 138],
      ),
      [0, 24, 48],
    );
    assert.deepStrictEqual(
      startsOfRows(
        { top: 100, scrolled: 0, scrollPaddingTop: 'auto' },
        [104, 128, 152],
      ),
      [0, 28, 52],
    );
  });

  test('steps the wheel by the shortest row, so a notch never passes more rows than it says, leaving out rows not drawn', () => {
    assert.strictEqual(rowStep([36, 24, 24, 30]), 24);
    assert.strictEqual(rowStep([0, 24]), 24);
    assert.strictEqual(rowStep([]), 0);
  });
});
