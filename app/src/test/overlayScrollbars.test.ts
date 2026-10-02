import * as assert from 'node:assert';
import {
  dragFrom,
  draggedScroll,
  drawsOverlay,
  followedScroller,
  thumbBox,
  scrollPerPixel,
  sidewaysMetrics,
  sidewaysScroll,
  thumbOf,
} from '../webview/overlayScrollbars';
import { stylesheet } from './fixtures';

suite('Overlay scrollbars', () => {
  test('shows no thumb when everything fits', () => {
    assert.strictEqual(thumbOf(500, 500, 0), undefined);
    assert.strictEqual(thumbOf(500.5, 500, 0), undefined);
  });

  test('sizes the thumb by how much is shown, and moves it from end to end', () => {
    assert.deepStrictEqual(thumbOf(1000, 500, 0), { offset: 0, length: 250 });
    assert.deepStrictEqual(thumbOf(1000, 500, 250), {
      offset: 125,
      length: 250,
    });
    assert.deepStrictEqual(thumbOf(1000, 500, 500), {
      offset: 250,
      length: 250,
    });
  });

  test('keeps a thumb for long content big enough to grab, inside the track', () => {
    assert.deepStrictEqual(thumbOf(1_000_000, 500, 0), {
      offset: 0,
      length: 24,
    });
    assert.deepStrictEqual(thumbOf(1_000_000, 500, 2_000_000), {
      offset: 476,
      length: 24,
    });
  });

  test('scrolls the content as far for each pixel the thumb is dragged as it has room to', () => {
    assert.strictEqual(scrollPerPixel(1000, 500), 2);
    assert.strictEqual(scrollPerPixel(500, 500), 0);
  });

  test('keeps moving with the area being dragged, whatever the pointer is over', () => {
    assert.strictEqual(followedScroller(true, 'list', 'diff'), 'list');
    assert.strictEqual(followedScroller(true, 'list', null), 'list');
    assert.strictEqual(followedScroller(false, 'list', 'diff'), 'diff');
  });

  test('leaves only the vertical scrollbar to an area with its own, like the minimap', () => {
    assert.strictEqual(drawsOverlay('vertical', true), false);
    assert.strictEqual(drawsOverlay('horizontal', true), true);
    assert.strictEqual(drawsOverlay('vertical', false), true);
  });

  test('takes no room for the native scrollbars', () => {
    assert.match(
      stylesheet(),
      /::-webkit-scrollbar \{\s*width: 0;\s*height: 0;\s*\}/,
    );
  });

  const scroller = {
    left: 100,
    top: 50,
    clientLeft: 1,
    clientTop: 1,
    clientWidth: 400,
    clientHeight: 500,
    scrollWidth: 800,
    scrollHeight: 1000,
    scrollLeft: 200,
    scrollTop: 250,
  };

  test('places the vertical thumb over the right edge and the horizontal one over the bottom', () => {
    assert.deepStrictEqual(thumbBox('vertical', scroller, 25), {
      left: 101 + 400 - 25,
      top: 51 + 125,
      width: 25,
      height: 250,
    });
    assert.deepStrictEqual(thumbBox('horizontal', scroller, 25), {
      left: 101 + 100,
      top: 51 + 500 - 25,
      width: 200,
      height: 25,
    });
  });

  test('places no thumb along an axis that fits', () => {
    assert.strictEqual(
      thumbBox('horizontal', { ...scroller, scrollWidth: 400 }, 25),
      undefined,
    );
  });

  test('scrolls by how far the thumb is dragged along its own axis', () => {
    const pointer = { clientX: 300, clientY: 200 };
    const vertical = dragFrom('vertical', scroller, pointer);
    assert.strictEqual(
      draggedScroll('vertical', vertical, { clientX: 999, clientY: 210 }),
      250 + 10 * 2,
    );
    const horizontal = dragFrom('horizontal', scroller, pointer);
    assert.strictEqual(
      draggedScroll('horizontal', horizontal, { clientX: 290, clientY: 999 }),
      200 - 10 * 2,
    );
  });

  test('measures the two sides of a side by side diff, scrolled together, as one area scrolled across the whole width', () => {
    const sides = sidewaysMetrics(
      { ...scroller, clientWidth: 1000, scrollWidth: 1000, scrollLeft: 0 },
      400,
      400,
      200,
    );
    assert.strictEqual(sides.scrollWidth, 2000);
    assert.strictEqual(sides.scrollLeft, 500);
    assert.deepStrictEqual(thumbOf(sides.scrollWidth, sides.clientWidth, 500), {
      offset: 250,
      length: 500,
    });
    assert.strictEqual(sidewaysScroll(500, 1000, 400), 200);
  });

  test('measures two sides that fit, or have no width, as not scrolling', () => {
    const fitting = { ...scroller, clientWidth: 1000, scrollWidth: 1000 };
    for (const [side, widest] of [
      [400, 0],
      [0, 400],
    ]) {
      const sides = sidewaysMetrics(fitting, side, widest, 0);
      assert.strictEqual(thumbBox('horizontal', sides, 25), undefined);
    }
    assert.strictEqual(sidewaysScroll(500, 1000, 0), 0);
  });
});
