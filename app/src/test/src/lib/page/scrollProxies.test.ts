import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test } from 'vitest';
import {
  proxyRatio,
  proxyScroll,
  proxyShare,
  scrollProxy,
} from '../../../../lib/page/scrollProxies';
import {
  rowScrollerOf,
  setWheeled,
  wheeledAround,
} from '../../../../lib/page/scrollbarLinks';

function standIn(height: number) {
  const dom = new JSDOM(
    '<!doctype html><body><div id="view"></div><div id="proxy"><div class="scroll-proxy-size"></div></div></body>',
  );
  const { document } = dom.window;
  const saved = Reflect.get(globalThis, 'ResizeObserver');
  Reflect.set(
    globalThis,
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
  const element = document.getElementById('proxy');
  const view = document.getElementById('view');
  const size = element?.querySelector<HTMLElement>('.scroll-proxy-size');
  assert.ok(element && view && size);
  let top = 0;
  const content = () => (parseFloat(size.style.height || '100') / 100) * height;
  Object.defineProperties(element, {
    clientHeight: { get: () => Math.round(height) },
    scrollHeight: { get: () => Math.round(content()) },
    scrollTop: {
      get: () => top,
      set: (to: number) => {
        top = Math.max(0, Math.min(content() - height, to));
      },
    },
  });
  const drags: number[] = [];
  const letGo: number[] = [];
  const proxy = scrollProxy(
    element,
    'vertical',
    {
      onDrag: (share) => drags.push(share),
      onLetGo: () => letGo.push(drags.length),
      onStep: () => {},
    },
    () => view,
  );
  return {
    element,
    view,
    proxy,
    drags,
    letGo,
    sizeWritten: () => size.style.height,
    scrolledTo: (to: number) => {
      element.scrollTop = to;
      element.dispatchEvent(new dom.window.Event('scroll'));
    },
    told: (type: string) => element.dispatchEvent(new dom.window.Event(type)),
    wheel: () => new dom.window.WheelEvent('wheel'),
    close: () => {
      proxy.stop();
      Reflect.set(globalThis, 'ResizeObserver', saved);
      dom.window.close();
    },
  };
}

suite('A scrollbar standing in for a view that scrolls by itself', () => {
  test('is as many times longer than what it shows as the view is, so the browser draws its thumb as long as the share shown, and no longer than where that thumb is at its shortest, 24 pixels, as a longer one draws the same thumb and had a view that grows, as a terminal filling its scrollback, restyle it and lay it out for every line', () => {
    assert.strictEqual(proxyRatio({ at: 0, length: 0.25 }, 480), 4);
    assert.strictEqual(proxyRatio({ at: 0.5, length: 1 }, 480), 1);
    assert.strictEqual(proxyRatio(undefined, 480), 1);
    assert.strictEqual(proxyRatio({ at: 0, length: 1e-9 }, 480), 20);
    assert.strictEqual(proxyRatio({ at: 0, length: 0 }, 480), 20);
    assert.strictEqual(proxyRatio({ at: 0, length: 0.04 }, 480), 20);
    assert.strictEqual(proxyRatio({ at: 0, length: 0.25 }, 0), 1);
  });

  test('is scrolled as far through the room it has to scroll as the view is through its own, wherever the view says it is, and nowhere while the view has nothing to scroll', () => {
    assert.strictEqual(proxyScroll({ at: 0.5, length: 0.25 }, 900), 450);
    assert.strictEqual(proxyScroll({ at: 0.99, length: 0.25 }, 900), 891);
    assert.strictEqual(proxyScroll({ at: -1, length: 0.25 }, 900), 0);
    assert.strictEqual(proxyScroll(undefined, 900), 0);
    assert.strictEqual(proxyScroll({ at: 0.5, length: 1 }, 0), 0);
  });

  test('is scrolled a pixel past the room the sizes it rounds give once the view is at its end, so the browser takes it to its very end, as a file viewed at its end at 175% left its scroller at 7078.857 of the 7079.429 it scrolls, the room giving 7079 and the browser a device pixel less', () => {
    assert.strictEqual(proxyScroll({ at: 1, length: 0.25 }, 7079), 7080);
    assert.strictEqual(proxyScroll({ at: 7, length: 0.25 }, 7079), 7080);
    assert.strictEqual(proxyScroll({ at: 1, length: 1 }, 0), 0);
  });

  test('tells how far through its room it was scrolled as a share, the whole of it from a pixel before its end, as the browser rounds what it reports', () => {
    assert.strictEqual(proxyShare(450, 900), 0.5);
    assert.strictEqual(proxyShare(0, 900), 0);
    assert.strictEqual(proxyShare(899.2, 900), 1);
    assert.strictEqual(proxyShare(950, 900), 1);
    assert.strictEqual(proxyShare(10, 0), 0);
  });

  test('stays at its end where its height is no whole pixel, taking where the browser stops it for where the view put it rather than for a scroll of the user, as the terminal at a scale of 150% hopped two lines back from its end and no longer followed what was printed', () => {
    const { proxy, element, drags, scrolledTo, told, letGo, close } =
      standIn(666.67);
    try {
      proxy.show({ at: 1, length: 1 / 125 });
      told('scroll');
      told('scrollend');
      assert.deepStrictEqual([drags, letGo], [[], []]);

      scrolledTo((element.scrollHeight - element.clientHeight) / 2);
      assert.strictEqual(drags.length, 1);
      assert.ok(Math.abs((drags[0] ?? 0) - 0.5) < 0.001, String(drags[0]));
      scrolledTo(1e9);
      assert.strictEqual(drags.at(-1), 1);
      told('scrollend');
      assert.deepStrictEqual(letGo, [2]);
      told('scrollend');
      assert.deepStrictEqual(letGo, [2]);
    } finally {
      close();
    }
  });

  test('goes back to where its view is once a scroll of the browser has ended, as a view that lands on whole columns may stay on the one it was on and say nothing, and the thumb stood where the browser left it until its tab was shown again', () => {
    const { proxy, element, drags, scrolledTo, told, letGo, close } =
      standIn(600);
    try {
      proxy.show({ at: 0.25, length: 0.25 });
      const room = element.scrollHeight - element.clientHeight;
      assert.strictEqual(element.scrollTop, room / 4);

      scrolledTo(room / 2);
      assert.deepStrictEqual([drags, element.scrollTop], [[0.5], room / 2]);
      told('scrollend');
      assert.deepStrictEqual(
        [letGo, element.scrollTop, drags],
        [[1], room / 4, [0.5]],
      );

      scrolledTo(room / 2);
      proxy.show({ at: 0.75, length: 0.25 });
      told('scrollend');
      assert.deepStrictEqual(
        [letGo, element.scrollTop],
        [[1, 2], (3 * room) / 4],
      );
    } finally {
      close();
    }
  });

  test('keeps its thumb under the pointer dragging it, wherever the view says it is meanwhile, and goes where the view is once let go, as a file viewed put the thumb back at the start of its top row at every step of a drag and it hopped from row to row', () => {
    const { proxy, element, drags, letGo, close } = standIn(600);
    try {
      proxy.show({ at: 0.25, length: 0.25 });
      const room = element.scrollHeight - element.clientHeight;
      const held = rowScrollerOf(element);
      assert.ok(held !== undefined);

      held.dragTo(room / 2 + 7);
      proxy.show({ at: 0.5, length: 0.25 });
      assert.deepStrictEqual(
        [drags, element.scrollTop],
        [[(room / 2 + 7) / room], room / 2 + 7],
      );

      held.dragEnd();
      assert.deepStrictEqual([letGo, element.scrollTop], [[1], room / 2]);
    } finally {
      close();
    }
  });

  test('writes how long it is only once the share shown changes, so a view that scrolls restyles nothing', () => {
    const { proxy, sizeWritten, element, close } = standIn(300);
    try {
      proxy.show({ at: 0, length: 0.25 });
      assert.strictEqual(sizeWritten(), '400%');
      const size = element.querySelector<HTMLElement>('.scroll-proxy-size');
      assert.ok(size);
      let writes = 0;
      const write = size.style.setProperty.bind(size.style);
      size.style.setProperty = (...written) => {
        writes += 1;
        write(...written);
      };
      proxy.show({ at: 0.5, length: 0.25 });
      proxy.show({ at: 1, length: 0.25 });
      assert.deepStrictEqual([writes, element.scrollTop], [0, 900]);
      proxy.show({ at: 1, length: 0.5 });
      assert.deepStrictEqual([writes, element.scrollTop], [1, 300]);
      proxy.show({ at: 1, length: 0.05 });
      assert.deepStrictEqual([writes, sizeWritten()], [2, '1250%']);
      proxy.show({ at: 1, length: 0.01 });
      proxy.show({ at: 1, length: 0.001 });
      assert.deepStrictEqual([writes, sizeWritten()], [2, '1250%']);
    } finally {
      close();
    }
  });

  test('hands a wheel turned over it to what takes the wheel of the view it stands for, found as the wheel turns, as the list of a diff was not there yet when the scrollbars below it were made', () => {
    const { element, view, wheel, close } = standIn(300);
    try {
      const turned: string[] = [];
      setWheeled(view, 'rows', () => turned.push('rows'));
      for (const turn of wheeledAround(element)) {
        turn(wheel());
      }
      assert.deepStrictEqual(turned, ['rows']);
      setWheeled(view, 'rows', undefined);
    } finally {
      close();
    }
  });
});
