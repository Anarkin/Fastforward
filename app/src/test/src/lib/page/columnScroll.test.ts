import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test } from 'vitest';
import { followColumns, snappedLeft } from '../../../../lib/page/columnScroll';

function scrolledAcross(smooth: boolean) {
  const dom = new JSDOM('<!doctype html><div id="wide"></div>');
  const element = dom.window.document.getElementById('wide');
  assert.ok(element);
  let left = 0;
  Object.defineProperties(element, {
    scrollWidth: { value: 2003 },
    clientWidth: { value: 400 },
    scrollLeft: {
      get: () => left,
      set: (value: number) => {
        left = value;
      },
    },
  });
  const frames: (() => void)[] = [];
  let now = 0;
  const globals = {
    requestAnimationFrame: (run: () => void) => frames.push(run),
    cancelAnimationFrame: () => frames.splice(0),
    performance: { now: () => now },
  };
  const saved = Object.fromEntries(
    Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
  );
  Object.assign(globalThis, globals);
  const stop = followColumns(element, {
    turned: (event) => event.shiftKey,
    advance: () => 8,
    perNotch: () => 10,
    smooth: () => smooth,
  });
  return {
    element,
    left: () => left,
    wheel: (deltaY: number, shiftKey = true) => {
      const event = new dom.window.WheelEvent('wheel', {
        deltaY,
        shiftKey,
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    },
    frame: (after: number) => {
      now += after;
      for (const run of frames.splice(0)) {
        run();
      }
    },
    close: () => {
      stop();
      Object.assign(globalThis, saved);
      dom.window.close();
    },
  };
}

suite('Scrolling sideways by whole columns', () => {
  test('lands on a whole column between the left edge and the right end, the end itself though it falls between columns', () => {
    assert.deepStrictEqual(
      [
        snappedLeft(83, 8, 1603),
        snappedLeft(85, 8, 1603),
        snappedLeft(-20, 8, 1603),
        snappedLeft(1700, 8, 1603),
        snappedLeft(50, 0, 1603),
        snappedLeft(50, 8, -5),
      ],
      [80, 88, 0, 1603, 50, 0],
    );
  });

  test('moves at once by the columns of the wheel turned sideways while scrolling does not glide, as rows move down at once then, landing on whole columns, and leaves the wheel turned alone to scroll down', () => {
    const { left, wheel, close } = scrolledAcross(false);
    try {
      const taken = wheel(80);
      const moved = left();
      wheel(83);
      const again = left();
      wheel(-8000);
      const back = left();
      const alone = wheel(80, false);

      assert.deepStrictEqual(
        [taken, moved, again, back, alone, left()],
        [true, 80, 160, 0, false, 0],
      );
    } finally {
      close();
    }
  });

  test('glides to the column the wheel turned sideways aims at while scrolling glides, on from a glide under way, ending on the column', () => {
    const { left, wheel, frame, close } = scrolledAcross(true);
    try {
      wheel(80);
      const atOnce = left();
      frame(50);
      const under = left();
      wheel(80);
      frame(1000);

      assert.strictEqual(atOnce, 0);
      assert.ok(under > 0 && under < 80, String(under));
      assert.strictEqual(left(), 160);
    } finally {
      close();
    }
  });
});
