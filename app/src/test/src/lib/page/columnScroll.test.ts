import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test, vi } from 'vitest';
import { followColumns, snappedLeft } from '../../../../lib/page/columnScroll';
import { holdRest } from '../../../../lib/page/scrollSettings';
import { columnScrollerOf } from '../../../../lib/page/scrollbarLinks';

function scrolledAcross(smooth: boolean, settles = true) {
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
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const follower = followColumns(element, {
    turned: (event) => event.shiftKey,
    advance: () => 8,
    perNotch: () => 10,
    smooth: () => smooth,
    settles: () => settles,
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
    follower,
    stop: follower.stop,
    swipe: (deltaX: number, deltaY: number) => {
      const event = new dom.window.WheelEvent('wheel', {
        deltaX,
        deltaY,
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    },
    rest: () => vi.advanceTimersByTime(holdRest),
    close: () => {
      follower.stop();
      vi.useRealTimers();
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

  test('moves with its scrollbar dragged sideways while scrolling glides, to where it is dragged at once, between columns too, and settles on a whole column by a glide once let go, unless set not to, where it stays as it was let go, but lands on whole columns at once while scrolling does not glide, on its end though that falls between columns', () => {
    const gliding = scrolledAcross(true);
    try {
      const bar = columnScrollerOf(gliding.element);
      assert.ok(bar);
      bar.dragTo(83);
      const dragged = gliding.left();
      bar.dragEnd();
      const letGo = gliding.left();
      gliding.frame(1000);

      assert.deepStrictEqual([dragged, letGo, gliding.left()], [83, 83, 80]);
    } finally {
      gliding.close();
    }
    const free = scrolledAcross(true, false);
    try {
      const bar = columnScrollerOf(free.element);
      assert.ok(bar);
      bar.dragTo(83);
      bar.dragEnd();
      free.frame(1000);

      assert.strictEqual(free.left(), 83);
    } finally {
      free.close();
    }
    const stepping = scrolledAcross(false);
    try {
      const bar = columnScrollerOf(stepping.element);
      assert.ok(bar);
      bar.dragTo(83);
      const dragged = stepping.left();
      bar.dragTo(5000);
      bar.dragEnd();
      stepping.stop();

      assert.deepStrictEqual(
        [dragged, stepping.left(), columnScrollerOf(stepping.element)],
        [80, 1603, undefined],
      );
    } finally {
      stepping.close();
    }
  });

  test('moves by the pixels of a touchpad swiped sideways at once while scrolling glides, settling on a whole column once the touchpad rests, steps by whole columns at once while it does not, and leaves a swipe mostly down to the rows', () => {
    const gliding = scrolledAcross(true);
    try {
      const taken = gliding.swipe(13, 2);
      gliding.swipe(14, 0);
      const touched = gliding.left();
      const down = gliding.swipe(2, 13);
      gliding.rest();
      gliding.frame(1000);

      assert.deepStrictEqual(
        [taken, touched, down, gliding.left()],
        [true, 27, false, 24],
      );
    } finally {
      gliding.close();
    }
    const stepping = scrolledAcross(false);
    try {
      stepping.swipe(5, 0);
      const short = stepping.left();
      stepping.swipe(5, 0);

      assert.deepStrictEqual([short, stepping.left()], [0, 8]);
    } finally {
      stepping.close();
    }
  });

  test('glides to a place it is sent to by a key while scrolling glides, onto a whole column, and jumps there at once while it does not, as the wheel turned sideways does', () => {
    const gliding = scrolledAcross(true);
    try {
      gliding.follower.scrollTo(83, true);
      const atOnce = gliding.left();
      gliding.frame(1000);

      assert.deepStrictEqual([atOnce, gliding.left()], [0, 80]);
    } finally {
      gliding.close();
    }
    const jumping = scrolledAcross(false);
    try {
      jumping.follower.scrollTo(83, true);

      assert.strictEqual(jumping.left(), 80);
    } finally {
      jumping.close();
    }
  });
});
