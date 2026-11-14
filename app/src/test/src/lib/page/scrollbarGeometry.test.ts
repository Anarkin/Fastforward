import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  dragFrom,
  draggedScroll,
  jumpedScroll,
  shareAt,
  thumbBox,
  trackBox,
  scrollPerPixel,
  thumbOf,
} from '../../../../lib/page/scrollbarGeometry';

const at = (clientX: number, clientY: number) => ({ clientX, clientY });

suite('Scrollbar geometry', () => {
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

  test('ends the thumb at the end of its track once the content is scrolled to within a pixel of its end, as the browser stops it a fraction of a pixel short at some scales', () => {
    assert.deepStrictEqual(thumbOf(1000, 100, 899.4), {
      offset: 76,
      length: 24,
    });
    assert.strictEqual(
      Math.round((thumbOf(1000, 100, 898)?.offset ?? 0) * 100) / 100,
      75.83,
    );
  });

  test('scrolls the content as far for each pixel the thumb is dragged as it has room to, and not at all when the thumb fills an area too small for it to move', () => {
    assert.strictEqual(scrollPerPixel(1000, 500), 2);
    assert.strictEqual(scrollPerPixel(500, 500), 0);
    assert.strictEqual(scrollPerPixel(100, 24), 0);
    assert.strictEqual(scrollPerPixel(100, 10), 0);
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

  test('keeps the thumb off the rounded corners of an area and off what covers an end of it, as the filter held atop a menu, sizing and dragging it along the track left', () => {
    const inset = {
      ...scroller,
      track: { top: 40, bottom: 6, left: 6, right: 6 },
    };

    assert.deepStrictEqual(thumbBox('vertical', inset, 25), {
      left: 101 + 400 - 25,
      top: 51 + 40 + 113.5,
      width: 25,
      height: 227,
    });
    assert.deepStrictEqual(thumbBox('horizontal', inset, 25), {
      left: 101 + 6 + 97,
      top: 51 + 500 - 25,
      width: 194,
      height: 25,
    });
    const drag = dragFrom('vertical', inset, { clientX: 0, clientY: 200 });
    assert.strictEqual(
      draggedScroll('vertical', drag, { clientX: 0, clientY: 427 }),
      250 + 500,
    );
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

  test('places the track a thumb runs along over the right edge, or the bottom, between the ends it keeps off, and none along an axis that fits', () => {
    assert.deepStrictEqual(trackBox('vertical', scroller, 25), {
      left: 101 + 400 - 25,
      top: 51,
      width: 25,
      height: 500,
    });
    assert.deepStrictEqual(trackBox('horizontal', scroller, 25), {
      left: 101,
      top: 51 + 500 - 25,
      width: 400,
      height: 25,
    });
    const inset = {
      ...scroller,
      track: { top: 40, bottom: 6, left: 6, right: 6 },
    };
    assert.deepStrictEqual(trackBox('vertical', inset, 25), {
      left: 101 + 400 - 25,
      top: 51 + 40,
      width: 25,
      height: 454,
    });
    assert.deepStrictEqual(trackBox('horizontal', inset, 25), {
      left: 101 + 6,
      top: 51 + 500 - 25,
      width: 388,
      height: 25,
    });
    assert.strictEqual(
      trackBox('horizontal', { ...scroller, scrollWidth: 400 }, 25),
      undefined,
    );
  });

  test('scrolls an area so that its thumb is centered where its track is pressed, as far as the ends allow', () => {
    assert.strictEqual(
      jumpedScroll('vertical', scroller, at(0, 51 + 300)),
      350,
    );
    assert.strictEqual(jumpedScroll('vertical', scroller, at(0, 51 + 10)), 0);
    assert.strictEqual(
      jumpedScroll('vertical', scroller, at(0, 51 + 495)),
      500,
    );
    assert.strictEqual(
      jumpedScroll('horizontal', scroller, at(101 + 150, 0)),
      100,
    );
    assert.strictEqual(
      jumpedScroll(
        'vertical',
        { ...scroller, track: { top: 40, bottom: 6, left: 6, right: 6 } },
        at(0, 51 + 40 + 227),
      ),
      250,
    );
  });

  test('takes the share of the way along a track for a pointer holding a thumb at a point of it, the middle by default, as far as the ends allow, and none for a thumb with no room to move', () => {
    assert.strictEqual(shareAt(60, 10, 100, 20), 0.5);
    assert.strictEqual(shareAt(0, 10, 100, 20), 0);
    assert.strictEqual(shareAt(200, 10, 100, 20), 1);
    assert.strictEqual(shareAt(60, 10, 100, 20, 0), 0.625);
    assert.strictEqual(shareAt(60, 10, 20, 20), 0);
  });
});
