import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test, vi } from 'vitest';
import {
  installScrollbars,
  layerOver,
  scrollbarCoverClass,
  scrollbarHeldAttribute,
  scrollbarHoverAttribute,
} from '../../../../lib/page/scrollbars';
import { setRowScroller } from '../../../../lib/page/scrollbarLinks';

const bar = 20;

function scrolledList() {
  const dom = new JSDOM(
    '<!doctype html><body><div id="list" style="overflow-y: scroll"><p id="row"></p></div><div id="other"></div></body>',
  );
  const { document } = dom.window;
  const frames: (() => void)[] = [];
  const watched: (() => void)[] = [];
  const globals = {
    window: dom.window,
    document,
    Element: dom.window.Element,
    Node: dom.window.Node,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: (run: () => void) => frames.push(run),
    cancelAnimationFrame: () => {},
    ResizeObserver: class {
      constructor(private readonly changed: () => void) {}
      observe(): void {
        watched.push(this.changed);
      }
      unobserve(): void {}
      disconnect(): void {}
    },
  };
  const saved = Object.fromEntries(
    Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
  );
  Object.assign(globalThis, globals);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const list = document.getElementById('list');
  const row = document.getElementById('row');
  const other = document.getElementById('other');
  assert.ok(list && row && other);
  let scrollTop = 0;
  Object.defineProperties(list, {
    scrollHeight: { value: 1000 },
    clientHeight: { value: 300 },
    clientWidth: { value: 380 },
    clientLeft: { value: 0 },
    clientTop: { value: 0 },
    scrollTop: {
      get: () => scrollTop,
      set: (to: number) => {
        scrollTop = to;
      },
    },
  });
  list.getBoundingClientRect = () => new dom.window.DOMRect(10, 50, 400, 300);
  list.setPointerCapture = () => {};
  dom.window.Element.prototype.setPointerCapture = () => {};
  installScrollbars();
  const cover = document.querySelector<HTMLElement>(
    `.${scrollbarCoverClass}.vertical`,
  );
  assert.ok(cover);
  const part = (name: string) => {
    const found = cover.querySelector<HTMLElement>(`.scrollbar-${name}`);
    assert.ok(found, name);
    return found;
  };
  cover.getBoundingClientRect = () => new dom.window.DOMRect(390, 50, bar, 300);
  const pointer = (
    type: string,
    target: Element,
    at: { clientX?: number; clientY?: number; buttons?: number } = {},
  ) =>
    target.dispatchEvent(
      new dom.window.MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        ...at,
      }),
    );
  const painted = () => {
    for (const run of frames.splice(0)) {
      run();
    }
    vi.advanceTimersByTime(0);
  };
  return {
    dom,
    list,
    row,
    other,
    cover,
    part,
    pointer,
    painted,
    scrolled: () => scrollTop,
    resized: () => watched.forEach((changed) => changed()),
    close: () => {
      vi.useRealTimers();
      Object.assign(globalThis, saved);
      dom.window.close();
    },
  };
}

suite('Scrollbars', () => {
  test('lays a cover nothing sees over the scrollbar of what the pointer is over, as wide as the browser draws the bar and as long, its buttons and its thumb where the browser draws them, so a press lands on the part it is seen on and the page takes it rather than the browser', () => {
    const { cover, row, part, pointer, painted, close } = scrolledList();
    try {
      pointer('pointermove', row);
      painted();

      assert.ok(cover.classList.contains('shown'));
      assert.deepStrictEqual(
        [
          cover.style.left,
          cover.style.top,
          cover.style.width,
          cover.style.height,
        ],
        ['390px', '50px', '20px', '300px'],
      );
      assert.deepStrictEqual(
        ['start', 'thumb', 'end'].map((name) => [
          part(name).style.top,
          part(name).style.height,
        ]),
        [
          ['0px', '20px'],
          ['20px', '78px'],
          ['280px', '20px'],
        ],
      );
    } finally {
      close();
    }
  });

  test('takes the cover away once what it scrolls is gone or the pointer comes over something that scrolls nowhere, as the cover of a menu closed stayed where the menu had been and took the presses meant for what was under it', () => {
    const { cover, list, row, other, pointer, painted, resized, close } =
      scrolledList();
    try {
      pointer('pointermove', row);
      painted();
      assert.ok(cover.classList.contains('shown'));

      list.remove();
      resized();
      assert.ok(!cover.classList.contains('shown'));

      pointer('pointermove', other);
      painted();
      assert.ok(!cover.classList.contains('shown'));
    } finally {
      close();
    }
  });

  test('scrolls to where the track is pressed, the thumb centered on the pointer, drags the thumb by as much as the pointer moves along the track, and moves a step on a press of a button, again and again while it is held, through what scrolls the rows when there is such, naming the part held on what it scrolls for the browser to draw it so', () => {
    const { cover, list, row, pointer, painted, scrolled, close } =
      scrolledList();
    try {
      pointer('pointermove', row);
      painted();
      pointer('pointerdown', cover, { clientY: 50 + 20 + 39 + 91, buttons: 1 });
      assert.strictEqual(scrolled(), 350);
      pointer('pointerup', cover, { buttons: 0 });

      pointer('pointerdown', cover, { clientY: 50 + 20 + 100, buttons: 1 });
      assert.strictEqual(
        list.getAttribute(scrollbarHeldAttribute),
        'vertical-thumb',
      );
      pointer('pointermove', cover, {
        clientY: 50 + 20 + 100 + 26,
        buttons: 1,
      });
      assert.strictEqual(scrolled(), 450);
      pointer('pointerup', cover, { buttons: 0 });
      assert.strictEqual(list.getAttribute(scrollbarHeldAttribute), null);

      const steps: number[] = [];
      setRowScroller(list, {
        dragTo: () => {},
        dragEnd: () => {},
        stepBy: (by) => steps.push(by),
      });
      pointer('pointerdown', cover, { clientY: 50 + 290, buttons: 1 });
      assert.deepStrictEqual(steps, [1]);
      vi.advanceTimersByTime(400);
      vi.advanceTimersByTime(60);
      assert.deepStrictEqual(steps, [1, 1, 1]);
      pointer('pointerup', cover, { buttons: 0 });
      vi.advanceTimersByTime(1000);
      assert.deepStrictEqual(steps, [1, 1, 1]);
      pointer('pointerdown', cover, { clientY: 50 + 5, buttons: 1 });
      pointer('pointerup', cover, { buttons: 0 });
      assert.deepStrictEqual(steps, [1, 1, 1, -1]);
      setRowScroller(list, undefined);
    } finally {
      close();
    }
  });

  test('names the part of a scrollbar the pointer is over on what it scrolls, and no longer once the pointer has left it, for the browser to draw that part lit', () => {
    const { list, row, part, pointer, painted, close } = scrolledList();
    try {
      pointer('pointermove', row);
      painted();
      pointer('pointerenter', part('thumb'));
      assert.strictEqual(
        list.getAttribute(scrollbarHoverAttribute),
        'vertical-thumb',
      );
      pointer('pointerleave', part('thumb'));
      assert.strictEqual(list.getAttribute(scrollbarHoverAttribute), null);
    } finally {
      close();
    }
  });

  test('draws a cover just over the highest layer what it scrolls is in, so it takes the presses on the scrollbar of a menu or a dialog, yet lies under a menu opened over its list', () => {
    assert.strictEqual(layerOver(['auto', '21', 'auto']), 22);
    assert.strictEqual(layerOver(['auto']), 20);
    assert.strictEqual(layerOver(['5']), 20);
  });
});
