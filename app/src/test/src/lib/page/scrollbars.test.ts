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
import {
  setRowScroller,
  setWheeled,
} from '../../../../lib/page/scrollbarLinks';

const bar = 20;

function scrolledList(tall = 300) {
  const dom = new JSDOM(
    '<!doctype html><body><div id="list" style="overflow-y: scroll"><p id="row"></p><p id="next"></p></div><div id="other"></div></body>',
  );
  const { document } = dom.window;
  const frames: (() => void)[] = [];
  const styled: Element[] = [];
  const watched: (() => void)[] = [];
  const globals = {
    window: dom.window,
    document,
    Element: dom.window.Element,
    Node: dom.window.Node,
    getComputedStyle: (element: Element) => {
      styled.push(element);
      return dom.window.getComputedStyle(element);
    },
    devicePixelRatio: 1,
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
  const next = document.getElementById('next');
  const other = document.getElementById('other');
  assert.ok(list && row && next && other);
  let scrollTop = 0;
  Object.defineProperties(list, {
    scrollHeight: { value: 1000 },
    clientHeight: { value: tall },
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
  list.getBoundingClientRect = () => new dom.window.DOMRect(10, 50, 400, tall);
  const scrolledBy: number[][] = [];
  list.scrollBy = (...by: unknown[]) => {
    scrolledBy.push(by.map(Number));
  };
  let under: Element = list;
  document.elementsFromPoint = () => [under];
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
  cover.getBoundingClientRect = () =>
    new dom.window.DOMRect(390, 50, bar, tall);
  const pointer = (
    type: string,
    target: Element,
    at: {
      clientX?: number;
      clientY?: number;
      button?: number;
      buttons?: number;
      ctrlKey?: boolean;
    } = {},
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
    next,
    other,
    styled,
    cover,
    part,
    pointer,
    painted,
    scrolled: () => scrollTop,
    scrollTo: (to: number) => {
      scrollTop = to;
    },
    scrolledBy,
    lieOver: (element: Element) => {
      under = element;
    },
    wheel: (
      target: Element,
      deltaY: number,
      held: { ctrlKey?: boolean; shiftKey?: boolean } = {},
    ) =>
      target.dispatchEvent(
        new dom.window.WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          deltaY,
          ...held,
        }),
      ),
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

  test('takes the cover away once what it scrolls is gone, as the cover of a menu closed stayed where the menu had been and took the presses meant for what was under it', () => {
    const { cover, list, row, pointer, painted, resized, close } =
      scrolledList();
    try {
      pointer('pointermove', row);
      painted();
      assert.ok(cover.classList.contains('shown'));

      list.remove();
      resized();
      assert.ok(!cover.classList.contains('shown'));
    } finally {
      close();
    }
  });

  test('takes the cover away once the pointer comes over something that scrolls nowhere', () => {
    const { cover, row, other, pointer, painted, close } = scrolledList();
    try {
      pointer('pointermove', row);
      painted();
      assert.ok(cover.classList.contains('shown'));

      pointer('pointermove', other);
      painted();
      assert.ok(!cover.classList.contains('shown'));
    } finally {
      close();
    }
  });

  test('looks for no scrollbar anew while the pointer rests and what it is over only gives way to more of what the covers shown scroll, as every row scrolled under a resting pointer had the page read its layout and the styles of all it stands in, and looks again once the pointer is over something else', () => {
    const { cover, row, next, other, pointer, painted, styled, close } =
      scrolledList();
    try {
      pointer('pointermove', row);
      painted();
      assert.ok(cover.classList.contains('shown'));
      styled.length = 0;

      pointer('pointerover', next);
      painted();
      assert.deepStrictEqual(
        [styled.length, cover.classList.contains('shown')],
        [0, true],
      );

      pointer('pointerover', other);
      painted();
      assert.ok(styled.length > 0);
      assert.ok(!cover.classList.contains('shown'));
    } finally {
      close();
    }
  });

  test('takes a press or a wheel only while its scrollbar is what lies under the pointer, and goes once something else has come to lie over it, as a popup opened by a key over a scrollbar pointed at left its presses and its wheel to the list under it', () => {
    const {
      cover,
      row,
      other,
      pointer,
      painted,
      scrolled,
      lieOver,
      wheel,
      scrolledBy,
      close,
    } = scrolledList();
    try {
      pointer('pointermove', row);
      painted();
      lieOver(other);
      pointer('pointerdown', cover, { clientY: 50 + 200, buttons: 1 });
      assert.deepStrictEqual(
        [scrolled(), cover.classList.contains('shown')],
        [0, false],
      );
      pointer('pointerup', cover, { buttons: 0 });

      lieOver(row.parentElement ?? other);
      pointer('pointermove', row);
      painted();
      assert.ok(cover.classList.contains('shown'));
      lieOver(other);
      wheel(cover, 120);
      assert.deepStrictEqual(
        [scrolledBy, cover.classList.contains('shown')],
        [[], false],
      );
    } finally {
      close();
    }
  });

  test('leaves a press of any button but the main one, or one with a modifier, without scrolling anything, yet keeps it from the browser, which took the keyboard from what had it on a press of what cannot have it', () => {
    const { cover, list, row, pointer, painted, scrolled, close } =
      scrolledList();
    try {
      pointer('pointermove', row);
      painted();
      const taken = [
        pointer('pointerdown', cover, {
          clientY: 50 + 200,
          button: 2,
          buttons: 2,
        }),
        pointer('pointerdown', cover, {
          clientY: 50 + 200,
          buttons: 1,
          ctrlKey: true,
        }),
      ];
      assert.deepStrictEqual(
        [taken, scrolled(), list.getAttribute(scrollbarHeldAttribute)],
        [[false, false], 0, null],
      );
    } finally {
      close();
    }
  });

  test('scrolls nowhere on a press of a track too short for a thumb, as such a press took what it scrolls back to its start', () => {
    const { cover, row, pointer, painted, scrolled, scrollTo, close } =
      scrolledList(50);
    try {
      scrollTo(200);
      pointer('pointermove', row);
      painted();
      pointer('pointerdown', cover, { clientY: 50 + 25, buttons: 1 });
      pointer('pointerup', cover, { buttons: 0 });
      assert.strictEqual(scrolled(), 200);
    } finally {
      close();
    }
  });

  test('hands a wheel turned over a scrollbar to what scrolls its view by the wheel, and scrolls it as the browser would once that left the wheel alone, as a list too long for whole rows did, its scrollbar then scrolling nothing, yet not while a modifier but Shift is held, which asks for something else', () => {
    const { cover, list, row, pointer, painted, wheel, scrolledBy, close } =
      scrolledList();
    try {
      pointer('pointermove', row);
      painted();
      const seen: string[] = [];
      setWheeled(list, 'rows', () => seen.push('left alone'));
      assert.strictEqual(wheel(cover, 120), false);
      assert.deepStrictEqual([seen, scrolledBy], [['left alone'], [[0, 120]]]);
      assert.strictEqual(wheel(cover, 120, { ctrlKey: true }), false);
      assert.deepStrictEqual(scrolledBy, [[0, 120]]);
      wheel(cover, 60, { shiftKey: true });
      assert.deepStrictEqual(scrolledBy, [
        [0, 120],
        [0, 60],
      ]);

      setWheeled(list, 'rows', (event) => {
        seen.push('taken');
        event.preventDefault();
      });
      wheel(cover, 120);
      assert.deepStrictEqual([seen.at(-1), scrolledBy.length], ['taken', 2]);
      setWheeled(list, 'rows', undefined);
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
        stepBy: (by) => steps.push(by) > 0,
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

  test('moves a plain step on a button of a scrollbar whose view cannot step by its rows, as the buttons of a list of commits too long for whole rows did nothing', () => {
    const { cover, list, row, pointer, painted, scrolled, close } =
      scrolledList();
    try {
      pointer('pointermove', row);
      painted();
      setRowScroller(list, {
        dragTo: () => {},
        dragEnd: () => {},
        stepBy: () => false,
      });
      pointer('pointerdown', cover, { clientY: 50 + 290, buttons: 1 });
      pointer('pointerup', cover, { buttons: 0 });
      assert.strictEqual(scrolled(), 40);
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
