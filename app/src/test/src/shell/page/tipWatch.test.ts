import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test } from 'vitest';
import { warmFor, watchTips } from '../../../../shell/page/tipWatch';

function page(delay = 500) {
  const dom = new JSDOM(
    [
      '<!doctype html><body>',
      '<button id="wrap" data-tip="Wrap"></button>',
      '<button id="find" data-tip="Find"><b id="icon"></b></button>',
      '<p id="plain"></p>',
      '<span id="cut" data-tip="a/long/path.ts" data-tip-cut><i id="inner"></i></span>',
      '<div id="cells" data-tip-source><canvas id="canvas"></canvas></div>',
    ].join(''),
  );
  const { document } = dom.window;
  const anchors = new Map<number, Element>();
  const cells = document.getElementById('cells');
  assert.ok(cells);
  Object.assign(cells, {
    tipUnder: (x: number) => {
      if (x >= 100) {
        return undefined;
      }
      const cell = Math.floor(x / 10);
      let anchor = anchors.get(cell);
      if (anchor === undefined) {
        anchor = document.createElement('span');
        anchor.setAttribute('data-tip', `cell ${cell}`);
        anchor.setAttribute('data-tip-character', '');
        document.body.append(anchor);
        anchors.set(cell, anchor);
      }
      return anchor;
    },
  });
  let now = 0;
  let timers: { at: number; run: () => void }[] = [];
  const waits: number[] = [];
  const watch = watchTips(
    document,
    (anchor) =>
      anchor.hasAttribute('data-tip-character') ? 0 : (waits.at(-1) ?? delay),
    {
      now: () => now,
      after: (wait, run) => {
        const timer = { at: now + wait, run };
        timers.push(timer);
        return () => {
          timers = timers.filter((each) => each !== timer);
        };
      },
    },
  );
  const by = (id: string) => {
    const found = document.getElementById(id);
    assert.ok(found, id);
    return found;
  };
  let changes = 0;
  const unsubscribe = watch.subscribe(() => changes++);
  return {
    watch,
    by,
    waits,
    changes: () => changes,
    over: (id: string) =>
      by(id).dispatchEvent(
        new dom.window.MouseEvent('pointerover', { bubbles: true }),
      ),
    moveOver: (id: string, x: number) =>
      by(id).dispatchEvent(
        new dom.window.MouseEvent('pointermove', { bubbles: true, clientX: x }),
      ),
    outOfTheWindow: () =>
      document.body.dispatchEvent(
        new dom.window.MouseEvent('pointerout', {
          bubbles: true,
          relatedTarget: null,
        }),
      ),
    told: (type: string, target: EventTarget = document.body) =>
      target.dispatchEvent(new dom.window.Event(type, { bubbles: true })),
    window: dom.window,
    after: (ms: number) => {
      now += ms;
      for (const timer of timers.filter((each) => each.at <= now)) {
        timers = timers.filter((each) => each !== timer);
        timer.run();
      }
    },
    said: () => watch.shown()?.tip.said,
    close: () => {
      unsubscribe();
      watch.stop();
      dom.window.close();
    },
  };
}

suite('The tooltips of the page', () => {
  test('ask a view that draws its own text, as the cells do, for the tooltip of what the pointer moves over, a character shown after a delay of its own, another asked for as the pointer moves on to it, and none once it rests on nothing that has one, nor on what has its own tooltip', () => {
    const { over, moveOver, after, said, close } = page();
    try {
      over('canvas');
      moveOver('canvas', 15);
      assert.strictEqual(said(), 'cell 1');
      moveOver('canvas', 18);
      assert.strictEqual(said(), 'cell 1');
      moveOver('canvas', 35);
      assert.strictEqual(said(), 'cell 3');
      moveOver('canvas', 120);
      assert.strictEqual(said(), undefined);
      over('wrap');
      after(500);
      assert.strictEqual(said(), 'Wrap');
    } finally {
      close();
    }
  });

  test('show the tooltip of the element under the pointer once it has rested there as long as the settings say, found from whatever part of the element the pointer is over, and tell who draws it', () => {
    const { over, after, said, watch, by, changes, close } = page();
    try {
      over('icon');
      after(499);
      assert.deepStrictEqual([said(), changes()], [undefined, 0]);
      after(1);
      assert.deepStrictEqual([said(), changes()], ['Find', 1]);
      assert.strictEqual(watch.shown()?.anchor, by('find'));
      assert.strictEqual(watch.shown(), watch.shown());
    } finally {
      close();
    }
  });

  test('show none for a pointer that left before then, and hide the one shown once the pointer is over something else or out of the window', () => {
    const { over, after, said, outOfTheWindow, close } = page();
    try {
      over('wrap');
      after(300);
      over('plain');
      after(1000);
      assert.strictEqual(said(), undefined);
      over('wrap');
      after(500);
      assert.strictEqual(said(), 'Wrap');
      over('plain');
      assert.strictEqual(said(), undefined);
      after(5000);
      over('wrap');
      after(500);
      outOfTheWindow();
      assert.strictEqual(said(), undefined);
    } finally {
      close();
    }
  });

  test('show the next one at once while one is shown or was a moment ago, as a pointer moved along a toolbar reads one button after another, and wait again after longer', () => {
    const { over, after, said, close } = page();
    try {
      over('wrap');
      after(500);
      over('find');
      assert.strictEqual(said(), 'Find');
      over('plain');
      after(warmFor - 1);
      over('wrap');
      assert.strictEqual(said(), 'Wrap');
      over('plain');
      after(warmFor);
      over('find');
      assert.strictEqual(said(), undefined);
      after(500);
      assert.strictEqual(said(), 'Find');
    } finally {
      close();
    }
  });

  test('hide at a press, a key, a turn of the wheel, a scroll, a drag, a menu and a window that lost the focus, and stay hidden over that element until the pointer has left it', () => {
    const { over, after, said, told, window, close } = page();
    try {
      for (const type of [
        'pointerdown',
        'keydown',
        'wheel',
        'scroll',
        'dragstart',
        'contextmenu',
        'blur',
      ]) {
        over('plain');
        after(5000);
        over('wrap');
        after(500);
        assert.strictEqual(said(), 'Wrap', type);
        told(type, type === 'blur' ? window : undefined);
        assert.strictEqual(said(), undefined, type);
        over('wrap');
        after(5000);
        assert.strictEqual(said(), undefined, type);
      }
      over('plain');
      over('wrap');
      after(500);
      assert.strictEqual(said(), 'Wrap');
    } finally {
      close();
    }
  });

  test('show no tooltip for a press made before it showed, as a button pressed has been found', () => {
    const { over, after, said, told, close } = page();
    try {
      over('wrap');
      after(200);
      told('pointerdown');
      after(5000);
      assert.strictEqual(said(), undefined);
    } finally {
      close();
    }
  });

  test('show the tooltip of text that may be cut short only while it is cut, the element or a part of it wider than its room', () => {
    const { over, after, said, by, close } = page();
    try {
      over('cut');
      after(500);
      assert.strictEqual(said(), undefined);
      Object.defineProperties(by('inner'), {
        scrollWidth: { get: () => 300 },
        clientWidth: { get: () => 120 },
      });
      over('plain');
      after(5000);
      over('inner');
      after(500);
      assert.strictEqual(said(), 'a/long/path.ts');
    } finally {
      close();
    }
  });

  test('hide the tooltip of an element that left the page, and read how long to wait each time, as the settings may change', () => {
    const { over, after, said, by, told, waits, close } = page();
    try {
      over('wrap');
      after(500);
      by('wrap').remove();
      told('pointermove');
      assert.strictEqual(said(), undefined);
      waits.push(0);
      over('plain');
      after(5000);
      over('find');
      assert.strictEqual(said(), 'Find');
    } finally {
      close();
    }
  });

  test('listen no longer once stopped', () => {
    const { over, after, said, watch, close } = page();
    try {
      watch.stop();
      over('wrap');
      after(500);
      assert.strictEqual(said(), undefined);
    } finally {
      close();
    }
  });
});
