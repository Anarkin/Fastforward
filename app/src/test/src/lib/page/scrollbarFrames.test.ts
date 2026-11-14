import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  clipPathOf,
  thumbBox,
  trackBox,
} from '../../../../lib/page/scrollbarGeometry';
import {
  framedMetrics,
  paintedFrame,
} from '../../../../lib/page/scrollbarFrames';

const clipInHundredths = (box: ReturnType<typeof thumbBox>) =>
  box?.clip && {
    ...box.clip,
    after: Math.round(box.clip.after * 100) / 100,
  };

suite('Scrollbar frames', () => {
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

  test('keeps the thumb inside the line a rounded area around it draws along the edges they share, against that line, all the way to its ends, clipping it by the corner the area rounds there wherever it is, so the corner cuts into it a pixel more for each pixel it runs in rather than rounding it at once', () => {
    const shared = { left: 101, top: 0, right: 501, bottom: 551, line: 2 };
    const framed = framedMetrics(scroller, { ...shared, radius: 6 });
    const rounder = framedMetrics(scroller, { ...shared, radius: 14 });

    const atEnd = { ...framed, scrollTop: 500 };
    const nearEnd = { ...framed, scrollTop: 495 };
    const atStart = { ...framed, scrollLeft: 0 };

    assert.deepStrictEqual(trackBox('vertical', framed, 25), {
      left: 101 + 400 - 25 - 2,
      top: 51,
      width: 25,
      height: 500 - 2,
    });
    assert.deepStrictEqual(trackBox('horizontal', framed, 25), {
      left: 101 + 2,
      top: 51 + 500 - 25 - 2,
      width: 400 - 2 - 2,
      height: 25,
    });
    assert.deepStrictEqual(
      [
        clipInHundredths(thumbBox('vertical', framed, 25)),
        clipInHundredths(thumbBox('vertical', atEnd, 25)),
        clipInHundredths(thumbBox('vertical', nearEnd, 25)),
        clipInHundredths(thumbBox('horizontal', atStart, 25)),
        clipInHundredths(
          thumbBox('vertical', { ...rounder, scrollTop: 500 }, 25),
        ),
      ],
      [
        { before: 124.5, after: 124.5, start: 0, end: 4 },
        { before: 249, after: 0, start: 0, end: 4 },
        { before: 246.51, after: 2.49, start: 0, end: 4 },
        { before: 0, after: 198, start: 4, end: 4 },
        { before: 249, after: 0, start: 0, end: 12 },
      ],
    );
    assert.deepStrictEqual(
      [
        clipPathOf('vertical', { before: 249, after: 2.5, start: 0, end: 4 }),
        clipPathOf('horizontal', { before: 0, after: 198, start: 4, end: 6 }),
        clipPathOf('vertical', undefined),
      ],
      [
        'inset(-249px 0px -2.5px -4px round 0px 0px 4px 0px)',
        'inset(-6px -198px 0px 0px round 0px 0px 6px 4px)',
        '',
      ],
    );
    assert.strictEqual(
      thumbBox('vertical', framed, 25)?.left,
      101 + 400 - 25 - 2,
    );
  });

  test('takes the rounded area around a scrolling area as the screen paints it, its edges on whole device pixels and its line only as far as it fills them, so a thumb against the line covers a pixel the line fills in part', () => {
    assert.deepStrictEqual(
      paintedFrame(
        {
          left: 10.2,
          top: 5.75,
          right: 100.3,
          bottom: 300.1,
          line: 1.25,
          radius: 6,
        },
        2,
      ),
      { left: 10, top: 6, right: 100.5, bottom: 300, line: 1, radius: 6 },
    );
    assert.deepStrictEqual(
      paintedFrame(
        { left: 0, top: 0, right: 400, bottom: 300, line: 2, radius: 6 },
        1.5,
      ),
      { left: 0, top: 0, right: 400, bottom: 300, line: 2, radius: 6 },
    );
  });

  test('takes the rounding of an area along an edge it shares with the rounded area around it as the rounding of that area, which the thumb follows, keeping only its scroll padding off there, as the rounded body of a column showing a preview', () => {
    const rounded = framedMetrics(
      {
        ...scroller,
        track: { top: 6, bottom: 6, left: 6, right: 6 },
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
      },
      { left: 101, top: 0, right: 501, bottom: 551, line: 2, radius: 6 },
    );

    assert.deepStrictEqual(trackBox('vertical', rounded, 25), {
      left: 101 + 400 - 25 - 2,
      top: 51 + 6,
      width: 25,
      height: 500 - 6 - 2,
    });
  });

  test('meets the line of the rounded area around it exactly where that area ends between pixels, as an area measures its own size in whole pixels', () => {
    const between = framedMetrics(scroller, {
      left: 101,
      top: 0,
      right: 501.4,
      bottom: 551.4,
      line: 2,
      radius: 6,
    });
    const vertical = trackBox('vertical', between, 25);
    const horizontal = trackBox('horizontal', between, 25);

    assert.deepStrictEqual(
      [
        vertical && vertical.left + vertical.width,
        vertical && vertical.top + vertical.height,
        horizontal && horizontal.top + horizontal.height,
        horizontal && horizontal.left + horizontal.width,
      ].map((edge) => edge && Math.round(edge * 10) / 10),
      [499.4, 549.4, 549.4, 499.4],
    );
  });

  test('runs the thumb of a rounded area of its own, as a menu, to its edges, keeping it off the end its scroll padding covers, as the filter held atop it, and clipping it only by a corner it reaches', () => {
    const menu = framedMetrics(
      {
        ...scroller,
        track: { top: 40, bottom: 6, left: 6, right: 6 },
        padding: { top: 40, bottom: 0, left: 0, right: 0 },
      },
      { left: 100, top: 50, right: 502, bottom: 552, line: 1, radius: 6 },
    );

    assert.deepStrictEqual(trackBox('vertical', menu, 25), {
      left: 101 + 400 - 25,
      top: 51 + 40,
      width: 25,
      height: 500 - 40,
    });
    assert.deepStrictEqual(
      [
        thumbBox('vertical', { ...menu, scrollTop: 0 }, 25)?.clip,
        thumbBox('vertical', { ...menu, scrollTop: 500 }, 25)?.clip,
      ],
      [
        { before: 0, after: 230, start: 0, end: 5 },
        { before: 230, after: 0, start: 0, end: 5 },
      ],
    );
  });

  test('runs the thumb of a rounded area of its own to the edge the screen paints a fraction of a pixel beyond its box, clipping it by its corner there, where no scroll padding keeps it off', () => {
    const menu = framedMetrics(
      {
        ...scroller,
        top: 50.5,
        clientLeft: 0,
        clientTop: 0,
        track: { top: 40, bottom: 6, left: 6, right: 6 },
        padding: { top: 40, bottom: 0, left: 0, right: 0 },
      },
      { left: 100, top: 51, right: 500, bottom: 551, line: 0, radius: 6 },
    );

    assert.deepStrictEqual(trackBox('vertical', menu, 25), {
      left: 100 + 400 - 25,
      top: 50.5 + 40,
      width: 25,
      height: 460.5,
    });
    assert.deepStrictEqual(
      thumbBox('vertical', { ...menu, scrollTop: 500 }, 25)?.clip,
      { before: 230.25, after: 0, start: 0, end: 6 },
    );
  });

  test('leaves the thumb where it was where the area shares no edge with a rounded area around it, or there is none, keeping the further of its own ends and the frame', () => {
    const apart = framedMetrics(scroller, {
      left: 0,
      top: 0,
      right: 900,
      bottom: 900,
      line: 2,
      radius: 6,
    });
    const padded = framedMetrics(
      { ...scroller, track: { top: 0, bottom: 10, left: 0, right: 0 } },
      { left: 101, top: 0, right: 501, bottom: 551, line: 2, radius: 6 },
    );

    assert.deepStrictEqual(
      trackBox('vertical', apart, 25),
      trackBox('vertical', scroller, 25),
    );
    assert.deepStrictEqual(framedMetrics(scroller, undefined), scroller);
    assert.strictEqual(trackBox('vertical', padded, 25)?.height, 500 - 10);
  });
});
