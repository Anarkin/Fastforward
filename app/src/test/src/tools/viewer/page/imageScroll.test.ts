import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { imageScrolled } from '../../../../../tools/viewer/page/imageScroll';

suite('Previews of a file viewed', () => {
  test('scrolls an image shown at its real size by a step, a screen less a step, or to an end, either way, never past an edge, as the browser leaves keys alone on some systems', () => {
    const scroller = {
      scrollTop: 500,
      scrollLeft: 300,
      scrollHeight: 2000,
      scrollWidth: 3000,
      clientHeight: 600,
      clientWidth: 1000,
    };
    assert.deepStrictEqual(imageScrolled(scroller, 'down'), {
      top: 540,
      left: 300,
    });
    assert.deepStrictEqual(imageScrolled(scroller, 'up'), {
      top: 460,
      left: 300,
    });
    assert.deepStrictEqual(imageScrolled(scroller, 'pageDown'), {
      top: 1060,
      left: 300,
    });
    assert.deepStrictEqual(imageScrolled(scroller, 'pageUp'), {
      top: 0,
      left: 300,
    });
    assert.deepStrictEqual(imageScrolled(scroller, 'first'), {
      top: 0,
      left: 300,
    });
    assert.deepStrictEqual(imageScrolled(scroller, 'last'), {
      top: 1400,
      left: 300,
    });
    assert.deepStrictEqual(imageScrolled(scroller, 1), { top: 500, left: 340 });
    assert.deepStrictEqual(imageScrolled(scroller, -1), {
      top: 500,
      left: 260,
    });
    assert.deepStrictEqual(
      imageScrolled({ ...scroller, scrollLeft: 1990 }, 1),
      { top: 500, left: 2000 },
    );
  });
});
