import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test, vi } from 'vitest';
import {
  clipPathOf,
  dragFrom,
  draggedScroll,
  drawsOverlay,
  followedScroller,
  framedMetrics,
  grabbedAt,
  installOverlayScrollbars,
  jumpedScroll,
  overlayScrollbarClass,
  paintedFrame,
  scrolledScroller,
  shareAt,
  thumbBox,
  trackBox,
  trackOf,
  scrollPerPixel,
  sidewaysMetrics,
  sidewaysScroll,
  thumbOf,
} from '../../../../lib/page/overlayScrollbars';
import { stylesheet } from '../../../helpers/fixtures';

const none = () => null;

const at = (clientX: number, clientY: number) => ({ clientX, clientY });

const clipInHundredths = (box: ReturnType<typeof thumbBox>) =>
  box?.clip && {
    ...box.clip,
    after: Math.round(box.clip.after * 100) / 100,
  };

const painted = () =>
  new Promise((resolve) =>
    setTimeout(() => setTimeout(() => setTimeout(resolve))),
  );

function framedList(height = 100) {
  const dom = new JSDOM(
    '<!doctype html><body style="--scrollbar-size: 20px"><div id="list" style="overflow-y: auto"></div></body>',
  );
  const { document } = dom.window;
  const frames: (() => void)[] = [];
  const globals = {
    window: dom.window,
    document,
    Element: dom.window.Element,
    Node: dom.window.Node,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: (run: () => void) => frames.push(run),
    cancelAnimationFrame: () => {},
  };
  const saved = Object.fromEntries(
    Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
  );
  Object.assign(globalThis, globals);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const list = document.getElementById('list');
  assert.ok(list);
  let scrollTop = 0;
  Object.defineProperties(list, {
    scrollHeight: { value: 1000 },
    clientHeight: { value: 100 },
    clientWidth: { value: 400 },
    scrollTop: { get: () => scrollTop },
  });
  list.getBoundingClientRect = () => new dom.window.DOMRect(0, 0, 400, height);
  installOverlayScrollbars();
  const bar = document.querySelector<HTMLElement>(
    `.${overlayScrollbarClass}.vertical`,
  );
  assert.ok(bar);
  return {
    dom,
    list,
    bar,
    scrollTo: (to: number) => {
      scrollTop = to;
      list.dispatchEvent(new dom.window.Event('scroll'));
    },
    frame: () => {
      for (const run of frames.splice(0)) {
        run();
      }
    },
    close: () => {
      vi.useRealTimers();
      Object.assign(globalThis, saved);
      dom.window.close();
    },
  };
}

suite('Overlay scrollbars', () => {
  test('shows and places the scrollbar of an area scrolled, by keys too, in the frame after the scroll, without waiting for a timer, as timers wait behind a flood of key presses held down', () => {
    const { bar, scrollTo, frame, close } = framedList();
    try {
      scrollTo(450);
      frame();
      const middle = {
        shown: bar.classList.contains('shown'),
        top: bar.style.top,
      };
      scrollTo(900);
      frame();

      assert.deepStrictEqual(
        [middle.shown, middle.top !== '', bar.classList.contains('shown')],
        [true, true, true],
      );
      assert.ok(
        Number.parseFloat(bar.style.top) > Number.parseFloat(middle.top),
        `${middle.top} then ${bar.style.top}`,
      );
    } finally {
      close();
    }
  });

  test('takes the height of an area between pixels, as the browser measures it while its whole pixels round it, so the thumb of an area scrolled to its end reaches its end', () => {
    const { bar, scrollTo, frame, close } = framedList(100.4);
    try {
      scrollTo(1000 - 100.4);
      frame();

      assert.strictEqual(
        Math.round(
          (Number.parseFloat(bar.style.top) +
            Number.parseFloat(bar.style.height)) *
            10,
        ) / 10,
        100.4,
      );
    } finally {
      close();
    }
  });

  test('keeps the scrollbar of an area shown when the row a pointer came over is gone by the next frame, as one the list scrolled away from', () => {
    const { dom, list, bar, scrollTo, frame, close } = framedList();
    try {
      scrollTo(450);
      frame();
      const row = dom.window.document.createElement('div');
      list.append(row);
      row.dispatchEvent(
        new dom.window.MouseEvent('pointerover', { bubbles: true }),
      );
      row.remove();
      frame();
      vi.advanceTimersByTime(0);

      assert.ok(bar.classList.contains('shown'));
    } finally {
      close();
    }
  });

  test('follows what comes under a pointer that stays put, hiding the scrollbar of an area once something with nothing to scroll comes over it there, such as a message pinned by a click, once the frame is painted', async () => {
    const dom = new JSDOM(
      '<!doctype html><div id="list" style="overflow-y: auto"></div><div id="pinned"></div>',
    );
    const { document } = dom.window;
    const globals = {
      window: dom.window,
      document,
      Element: dom.window.Element,
      getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
      requestAnimationFrame: (run: () => void) => setTimeout(run),
      cancelAnimationFrame: (frame: ReturnType<typeof setTimeout>) =>
        clearTimeout(frame),
    };
    const saved = Object.fromEntries(
      Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
    );
    Object.assign(globalThis, globals);
    try {
      const list = document.getElementById('list');
      const pinned = document.getElementById('pinned');
      assert.ok(list && pinned);
      Object.defineProperties(list, {
        scrollHeight: { value: 1000 },
        clientHeight: { value: 100 },
      });
      installOverlayScrollbars();
      const bar = document.querySelector(`.${overlayScrollbarClass}.vertical`);
      list.dispatchEvent(
        new dom.window.MouseEvent('pointermove', { bubbles: true }),
      );
      await painted();
      assert.ok(bar);
      assert.ok(bar.classList.contains('shown'));
      pinned.dispatchEvent(
        new dom.window.MouseEvent('pointerover', { bubbles: true }),
      );
      await painted();
      assert.ok(!bar.classList.contains('shown'));
    } finally {
      Object.assign(globalThis, saved);
      dom.window.close();
    }
  });

  test('scrolls an area to where its track is pressed and follows the pointer while it is held, the thumb centered on it, without the press reaching what is under the track, while a press off the track does', async () => {
    const dom = new JSDOM(
      '<!doctype html><body style="--scrollbar-size: 20px"><div id="list" style="overflow-y: auto"><div id="row"></div></div></body>',
    );
    const { document } = dom.window;
    const globals = {
      window: dom.window,
      document,
      Element: dom.window.Element,
      getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
      requestAnimationFrame: (run: () => void) => setTimeout(run),
      cancelAnimationFrame: (frame: ReturnType<typeof setTimeout>) =>
        clearTimeout(frame),
    };
    const saved = Object.fromEntries(
      Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
    );
    Object.assign(globalThis, globals);
    Object.assign(dom.window.Element.prototype, {
      setPointerCapture: () => {},
    });
    try {
      const list = document.getElementById('list');
      const row = document.getElementById('row');
      assert.ok(list && row);
      Object.defineProperties(list, {
        scrollHeight: { value: 1000 },
        clientHeight: { value: 100 },
        clientWidth: { value: 400 },
        scrollTop: { value: 0, writable: true },
      });
      const pressedRows: number[] = [];
      row.addEventListener('pointerdown', (event) =>
        pressedRows.push(event.clientX),
      );
      installOverlayScrollbars();
      const press = (clientX: number, clientY: number) =>
        row.dispatchEvent(
          new dom.window.MouseEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: 1,
            clientX,
            clientY,
          }),
        );

      press(100, 50);
      assert.deepStrictEqual(pressedRows, [100]);
      assert.strictEqual(list.scrollTop, 0);

      assert.strictEqual(press(390, 50), false);
      assert.deepStrictEqual(pressedRows, [100]);
      assert.strictEqual(list.scrollTop, 450);
      const bar = document.querySelector(`.${overlayScrollbarClass}.vertical`);
      assert.ok(bar);
      bar.dispatchEvent(
        new dom.window.MouseEvent('pointermove', {
          buttons: 1,
          clientX: 0,
          clientY: 95,
        }),
      );
      assert.strictEqual(list.scrollTop, 900);
      bar.dispatchEvent(new dom.window.MouseEvent('pointerup', { buttons: 0 }));
      bar.dispatchEvent(
        new dom.window.MouseEvent('pointermove', { buttons: 1, clientY: 50 }),
      );
      assert.strictEqual(list.scrollTop, 900);
    } finally {
      Object.assign(globalThis, saved);
      dom.window.close();
    }
  });

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

  test('keeps moving with the area being dragged, whatever the pointer is over', () => {
    assert.strictEqual(followedScroller(true, 'list', 'diff'), 'list');
    assert.strictEqual(followedScroller(true, 'list', null), 'list');
    assert.strictEqual(followedScroller(false, 'list', 'diff'), 'diff');
  });

  test('shows a scrollbar for an area scrolled while it shows nothing, but leaves one showing for another area where it is, as the pointer may be on it', () => {
    assert.strictEqual(scrolledScroller('list', true, 'list', none), 'list');
    assert.strictEqual(scrolledScroller('list', false, 'list', none), 'list');
    assert.strictEqual(
      scrolledScroller('list', false, 'diff', () => 'diff'),
      'diff',
    );
    assert.strictEqual(scrolledScroller('list', false, 'diff', none), null);
    assert.strictEqual(
      scrolledScroller('list', true, 'diff', () => 'diff'),
      undefined,
    );
    assert.strictEqual(scrolledScroller('list', true, 'diff', none), undefined);
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
    assert.strictEqual(sidewaysScroll(500, 0, 400), 0);
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

  test('holds a thumb pressed where it was pressed, and one whose track was pressed beside it by its middle', () => {
    assert.strictEqual(grabbedAt(35, { top: 30, height: 20 }), 5);
    assert.strictEqual(grabbedAt(30, { top: 30, height: 20 }), 0);
    assert.strictEqual(grabbedAt(50, { top: 30, height: 20 }), 20);
    assert.strictEqual(grabbedAt(80, { top: 30, height: 20 }), 10);
    assert.strictEqual(grabbedAt(10, { top: 30, height: 20 }), 10);
  });
});
