import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { tabKeptOf } from '../../../../../tools/commander/page/tabKept';

suite('What a commander tab keeps', () => {
  test('takes back how far the box with the focus was scrolled across, so a narrow filter or find shows the end of what was typed as it did', () => {
    const focus = {
      name: 'filter left',
      selection: [30, 30, 'none'],
      scroll: 18,
    } as const;

    const kept = tabKeptOf({ sides: { focus } }, '1');

    assert.deepStrictEqual(kept.sides?.focus, focus);
  });
});
