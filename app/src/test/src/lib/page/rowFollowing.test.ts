import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test, vi } from 'vitest';
import { followRows } from '../../../../lib/page/rowScroll';
import { holdRest } from '../../../../lib/page/scrollSettings';
import { rowScrollerOf } from '../../../../lib/page/scrollbarLinks';

function followed(smooth: boolean, settles = true, furthest = 2000) {
  const dom = new JSDOM('<!doctype html><div id="list" tabindex="0"></div>');
  const element = dom.window.document.getElementById('list');
  assert.ok(element);
  let top = 0;
  Object.defineProperties(element, {
    scrollHeight: { value: 2400 },
    clientHeight: { value: 400 },
    scrollTop: {
      get: () => top,
      set: (value: number) => {
        top = Math.max(0, Math.min(furthest, value));
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
  const following = followRows(element, () => 20, {
    keys: true,
    perNotch: () => 10,
    smooth: () => smooth,
    settles: () => settles,
  });
  const frame = (after: number) => {
    now += after;
    for (const run of frames.splice(0)) {
      run();
    }
  };
  return {
    top: () => top,
    end: () => following.end(),
    glidingTo: () => following.glidingTo(),
    revealed: async (reveal: (seen: number) => number | undefined) => {
      following.reveals();
      const to = reveal(top);
      if (to !== undefined) {
        element.scrollTop = to;
      }
      await Promise.resolve();
      return top;
    },
    scrollbar: () => {
      const scroller = rowScrollerOf(element);
      assert.ok(scroller);
      return scroller;
    },
    wheel: (deltaY: number, notches: number | undefined) => {
      const event = new dom.window.WheelEvent('wheel', {
        deltaY,
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'wheelDeltaY', {
        value: notches === undefined ? -deltaY : -notches * 120,
      });
      element.dispatchEvent(event);
    },
    key: (key: string) =>
      element.dispatchEvent(
        new dom.window.KeyboardEvent('keydown', {
          key,
          bubbles: true,
          cancelable: true,
        }),
      ),
    frame,
    glided: () => {
      const places: number[] = [];
      for (let step = 0; step < 40 && frames.length > 0; step++) {
        frame(16);
        places.push(top);
      }
      return places;
    },
    rest: () => vi.advanceTimersByTime(holdRest),
    scrolled: () => element.dispatchEvent(new dom.window.Event('scroll')),
    movedTo: (to: number) => {
      element.scrollTop = to;
      element.dispatchEvent(new dom.window.Event('scroll'));
    },
    close: () => {
      following.stop();
      vi.useRealTimers();
      Object.assign(globalThis, saved);
      dom.window.close();
    },
  };
}

function ended(go: (list: ReturnType<typeof followed>) => void): number {
  const list = followed(true, true, 2000 + 4 / 7);
  try {
    go(list);
    list.glided();
    list.scrolled();
    return list.top();
  } finally {
    list.close();
  }
}

suite('Following a list scrolled by hand', () => {
  test('tells the end it scrolls a list to, the one its keys and a key of a view that moves it itself aim at, as the End of a diff aimed at the height of its rows less that of the view and stopped a row short of the end of its follower', () => {
    const list = followed(true);
    try {
      assert.strictEqual(list.end(), 2000);
    } finally {
      list.close();
    }
  });

  test('glides to as far as the browser scrolls a list on End and on the wheel, rather than to the end the sizes it rounds give, and leaves it there as the browser tells of the scroll, as the editor and the commit list stopped a device pixel short of their end at 175%, snapped back to the end the rounded sizes give once the glide had ended', () => {
    assert.strictEqual(
      ended(({ key }) => key('End')),
      2000 + 4 / 7,
    );
    assert.strictEqual(
      ended(({ wheel }) => {
        for (let notch = 0; notch < 20; notch++) {
          wheel(100, 1);
        }
      }),
      2000 + 4 / 7,
    );
  });

  test('moves a list with its scrollbar dragged while scrolling glides, to where it is dragged at once, between rows too, as each move of the pointer began a glide of its own and the list lagged behind the hand, and settles on a whole row by a glide once the scrollbar is let go, unless set not to, where it stays as it was let go', () => {
    const { top, scrollbar, glided, close } = followed(true);
    try {
      scrollbar().dragTo(133);
      const dragged = top();
      scrollbar().dragTo(271);
      const further = top();
      scrollbar().dragEnd();
      const letGo = top();
      const settling = glided();

      assert.deepStrictEqual([dragged, further, letGo], [133, 271, 271]);
      assert.ok(settling.length > 1, String(settling));
      assert.strictEqual(settling.at(-1), 280);
    } finally {
      close();
    }
    const free = followed(true, false);
    try {
      free.scrollbar().dragTo(133);
      free.scrollbar().dragEnd();

      assert.deepStrictEqual([free.top(), free.glided()], [133, []]);
    } finally {
      free.close();
    }
  });

  test('lands a list on whole rows at once with its scrollbar dragged while scrolling does not glide, with nothing left to settle once let go', () => {
    const { top, scrollbar, glided, close } = followed(false);
    try {
      scrollbar().dragTo(133);
      const dragged = top();
      scrollbar().dragEnd();

      assert.deepStrictEqual([dragged, top(), glided()], [140, 140, []]);
    } finally {
      close();
    }
  });

  test('moves a list by the pixels of a touchpad at once while scrolling glides, as a drag does, and settles on a whole row once the touchpad rests, but steps by whole rows at once while scrolling does not glide', () => {
    const gliding = followed(true);
    try {
      gliding.wheel(13, undefined);
      gliding.wheel(14, undefined);
      const touched = gliding.top();
      gliding.rest();
      const settling = gliding.glided();

      assert.strictEqual(touched, 27);
      assert.ok(settling.length > 1, String(settling));
      assert.strictEqual(settling.at(-1), 40);
    } finally {
      gliding.close();
    }
    const stepping = followed(false);
    try {
      stepping.wheel(13, undefined);
      const short = stepping.top();
      stepping.wheel(14, undefined);

      assert.deepStrictEqual([short, stepping.top()], [0, 20]);
    } finally {
      stepping.close();
    }
  });

  test('settles on the row the hand was moving toward, the next one down after a move down and the one above after a move up, however little it moved, so a short stroke of a touchpad over rows as tall as thumbnails still moves a row', () => {
    const { top, scrollbar, glided, close } = followed(true);
    try {
      scrollbar().dragTo(203);
      scrollbar().dragEnd();
      const down = glided().at(-1);
      scrollbar().dragTo(217);
      scrollbar().dragTo(199);
      scrollbar().dragEnd();
      glided();

      assert.deepStrictEqual([down, top()], [220, 180]);
    } finally {
      close();
    }
  });

  test('glides the last view of the way to a place far off, End or Home, landing a view short of it at once, as gliding all the way drew every row between in a moment', () => {
    const { top, key, glided, close } = followed(true);
    try {
      key('End');
      const atOnce = top();
      const places = glided();

      assert.strictEqual(atOnce, 1600);
      assert.ok(places.length > 1, String(places));
      assert.ok(
        places.every((place) => place >= 1600),
        String(places),
      );
      assert.strictEqual(places.at(-1), 2000);
    } finally {
      close();
    }
  });

  test('leaves a list where a touchpad left it, between rows, when it is told of that scroll only once the hold has rested, the settings saying not to settle, as a frame that took longer than the rest of a hold let the list take its own move for one from outside and snap it onto the next row, and still snaps a scroll that does come from outside', () => {
    const list = followed(true, false);
    try {
      list.wheel(13, undefined);
      list.wheel(13, undefined);
      list.rest();
      list.scrolled();
      const left = list.top();
      list.scrolled();
      const again = list.top();
      list.movedTo(47);

      assert.deepStrictEqual([left, again, list.top()], [26, 26, 60]);
    } finally {
      list.close();
    }
  });

  test('glides on every key while scrolling glides, a row on an arrow and a view on a page key alike, as only the page keys did, and jumps there at once while it does not', () => {
    for (const key of ['ArrowDown', 'PageDown']) {
      const gliding = followed(true);
      try {
        gliding.key(key);
        const atOnce = gliding.top();
        const places = gliding.glided();

        assert.strictEqual(atOnce, 0, key);
        assert.ok(places.length > 1, `${key}: ${String(places)}`);
        assert.ok((places.at(-1) ?? 0) > 0, key);
        assert.strictEqual((places.at(-1) ?? 0) % 20, 0, key);
      } finally {
        gliding.close();
      }
      const jumping = followed(false);
      try {
        jumping.key(key);

        assert.ok(jumping.top() > 0, key);
        assert.deepStrictEqual(jumping.glided(), [], key);
      } finally {
        jumping.close();
      }
    }
  });

  test('glides by the rows of a notch of the wheel while scrolling glides, as it did, a hold of the scrollbar or the touchpad ending any glide under way', () => {
    const { top, wheel, scrollbar, frame, glided, close } = followed(true);
    try {
      wheel(100, 1);
      frame(16);
      const under = top();
      scrollbar().dragTo(500);
      const held = top();
      const left = glided();

      assert.ok(under > 0 && under < 200, String(under));
      assert.deepStrictEqual([held, left], [500, []]);
    } finally {
      close();
    }
  });

  test('glides to where something else scrolled it to show a row while scrolling glides, as the editor shows the row its cursor moves onto, from where it was rather than jumping there; lets that reveal start from where a glide under way was heading, so a key held is not shown from the middle of a glide; lands a view short of a place far off; and stays where it was put while scrolling does not glide', async () => {
    const { top, revealed, key, frame, glided, close } = followed(true);
    try {
      const start = await revealed(() => 60);
      const near = glided();
      key('PageDown');
      frame(16);
      const midway = top();
      let from = NaN;
      const again = await revealed((seen) => {
        from = seen;
        return seen + 20;
      });
      const held = glided();
      const far = await revealed(() => 2000);
      const last = glided();
      const none = await revealed(() => undefined);

      assert.strictEqual(start, 0);
      assert.ok(near.length > 2, String(near));
      assert.strictEqual(near.at(-1), 60);
      assert.ok(midway > 60 && midway < 440, String(midway));
      assert.deepStrictEqual([from, again], [440, midway]);
      assert.strictEqual(held.at(-1), 460);
      assert.strictEqual(far, 1600);
      assert.strictEqual(last.at(-1), 2000);
      assert.strictEqual(none, 2000);
    } finally {
      close();
    }
    const still = followed(false);
    try {
      assert.strictEqual(await still.revealed(() => 60), 60);
      assert.deepStrictEqual(still.glided(), []);
    } finally {
      still.close();
    }
  });

  test('tells where a glide under way is heading, and nothing once it has arrived or while scrolling does not glide, so a list can draw the rows there before it shows them', () => {
    const { top, glidingTo, wheel, glided, close } = followed(true);
    try {
      wheel(100, 1);
      const heading = glidingTo();
      glided();

      assert.deepStrictEqual(
        [heading, top(), glidingTo()],
        [200, 200, undefined],
      );
    } finally {
      close();
    }
    const still = followed(false);
    try {
      still.wheel(100, 1);

      assert.deepStrictEqual(
        [still.top(), still.glidingTo()],
        [200, undefined],
      );
    } finally {
      still.close();
    }
  });
});
