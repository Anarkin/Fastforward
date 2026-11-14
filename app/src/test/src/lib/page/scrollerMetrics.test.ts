import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { trackOf } from '../../../../lib/page/scrollerMetrics';

suite('Scroller metrics', () => {
  test('takes the track of an area from the corners its radius rounds and the ends its scroll padding covers, whichever reaches further', () => {
    assert.deepStrictEqual(
      trackOf({
        scrollPaddingTop: '40px',
        scrollPaddingBottom: 'auto',
        scrollPaddingLeft: '0px',
        scrollPaddingRight: '0px',
        borderTopRightRadius: '6px',
        borderBottomRightRadius: '6px',
        borderBottomLeftRadius: '4px',
      }),
      { top: 40, bottom: 6, left: 4, right: 6 },
    );
  });
});
