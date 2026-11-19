import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test } from 'vitest';
import {
  proxyRatio,
  proxyScroll,
  proxyShare,
  scrollProxy,
} from '../../../../lib/page/scrollProxies';
import { setWheeled, wheeledAround } from '../../../../lib/page/scrollbarLinks';

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
  test('is as many times longer than what it shows as the view is, so the browser draws its thumb as long as the share shown, and no longer than 4,000 times, as a file of gigabytes would ask for more pixels than a page may have', () => {
    assert.strictEqual(proxyRatio({ at: 0, length: 0.25 }), 4);
    assert.strictEqual(proxyRatio({ at: 0.5, length: 1 }), 1);
    assert.strictEqual(proxyRatio(undefined), 1);
    assert.strictEqual(proxyRatio({ at: 0, length: 1e-9 }), 4000);
    assert.strictEqual(proxyRatio({ at: 0, length: 0 }), 4000);
  });

  test('is scrolled as far through the room it has to scroll as the view is through its own, wherever the view says it is, and nowhere while the view has nothing to scroll', () => {
    assert.strictEqual(proxyScroll({ at: 0.5, length: 0.25 }, 900), 450);
    assert.strictEqual(proxyScroll({ at: 1, length: 0.25 }, 900), 900);
    assert.strictEqual(proxyScroll({ at: 7, length: 0.25 }, 900), 900);
    assert.strictEqual(proxyScroll({ at: -1, length: 0.25 }, 900), 0);
    assert.strictEqual(proxyScroll(undefined, 900), 0);
    assert.strictEqual(proxyScroll({ at: 0.5, length: 1 }, 0), 0);
  });

  test('tells how far through its room it was scrolled as a share, the whole of it from a pixel before its end, as the browser rounds what it reports', () => {
    assert.strictEqual(proxyShare(450, 900), 0.5);
    assert.strictEqual(proxyShare(0, 900), 0);
    assert.strictEqual(proxyShare(899.2, 900), 1);
    assert.strictEqual(proxyShare(950, 900), 1);
    assert.strictEqual(proxyShare(10, 0), 0);
  });

  test('stays at its end where its height is no whole pixel, taking where the browser stops it for where the view put it rather than for a scroll of the user, as the terminal at a scale of 150% hopped two lines back from its end and no longer followed what was printed', () => {
    const { proxy, drags, scrolledTo, told, letGo, close } = standIn(666.67);
    try {
      proxy.show({ at: 1, length: 1 / 125 });
      told('scroll');
      told('scrollend');
      assert.deepStrictEqual([drags, letGo], [[], []]);

      scrolledTo(41333.5);
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
