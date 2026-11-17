import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test, vi } from 'vitest';
import {
  drawsOverlay,
  followedScroller,
  installOverlayScrollbars,
  layerOver,
  overlayScrollbarClass,
  scrolledScroller,
} from '../../../../lib/page/overlayScrollbars';
import { stylesheet } from '../../../helpers/pageSources';

const none = () => null;

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
  test('draws a scrollbar just over the highest layer what it scrolls is in, so it shows over its own menu or dialog, yet under a menu opened over its list', () => {
    assert.deepStrictEqual(
      [
        layerOver(['auto', 'auto']),
        layerOver(['auto', '1', 'auto']),
        layerOver(['21', 'auto']),
        layerOver(['auto', '25']),
      ],
      [20, 20, 22, 26],
    );
  });

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
});
