import * as assert from 'node:assert';
import { afterEach, beforeEach, suite, test, vi } from 'vitest';
import { holdRest } from '../../../../../lib/page/scrollSettings';
import { rowGlide } from '../../../../../lib/page/glide';
import type { Origin } from '../../../../../tools/canvas/page/pan';
import { Panner } from '../../../../../tools/canvas/page/panner';

function panner(smooth = true, smoothSnap = true) {
  let at: Origin = { column: 0, row: 0 };
  let now = 0;
  const frames: (() => void)[] = [];
  const panned: Origin[] = [];
  const made = new Panner({
    origin: () => at,
    pan: (to) => {
      at = to;
      panned.push(to);
    },
    scrolling: () => ({ wheelRows: 3, smooth, smoothSnap }),
    clock: {
      now: () => now,
      frame: (step) => frames.push(step),
      cancel: () => {
        frames.length = 0;
      },
    },
  });
  const run = (until: number) => {
    while (frames.length > 0) {
      now = Math.min(until, now + 16);
      frames.shift()?.();
    }
  };
  return { made, panned, run, at: () => at };
}

suite('Canvas panner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('glides to the whole cells a notch of the wheel moves it by, through places between, adding the next notch to where it glides', () => {
    const { made, panned, run, at } = panner();
    made.glideBy({ column: 0, row: 3 });
    made.glideBy({ column: 0, row: 3 });
    run(rowGlide);
    assert.deepStrictEqual(at(), { column: 0, row: 6 });
    assert.ok(panned.some((each) => each.row > 0 && each.row < 6));
  });

  test('stops a glide under way once a place is held, as a zoom holds the cell under the pointer, the glide moving it no further', () => {
    const { made, run, at } = panner();
    made.glideBy({ column: 0, row: 6 });
    made.holdAt({ column: 40, row: 9 });
    run(rowGlide);
    assert.deepStrictEqual(at(), { column: 40, row: 9 });
  });

  test('jumps to the whole cells a notch moves it by while scrolling glides not', () => {
    const { made, panned } = panner(false);
    made.glideBy({ column: 3, row: 0 });
    assert.deepStrictEqual(panned, [{ column: 3, row: 0 }]);
  });

  test('follows a touchpad by the part of a cell it strokes, and glides to the nearest whole cell once it rests', () => {
    const { made, run, at } = panner();
    made.holdBy({ column: 0.4, row: -1.3 });
    assert.deepStrictEqual(at(), { column: 0.4, row: -1.3 });
    vi.advanceTimersByTime(holdRest);
    run(holdRest + rowGlide);
    assert.deepStrictEqual(at(), { column: 0, row: -1 });
  });

  test('follows a drag where it is held, and settles on the nearest whole cell once let go, or stays where it was let go while the settings snap not', () => {
    const snapping = panner(false);
    snapping.made.holdAt({ column: 2.6, row: 1.2 });
    snapping.made.letGo();
    assert.deepStrictEqual(snapping.at(), { column: 3, row: 1 });
    const free = panner(true, false);
    free.made.holdAt({ column: 2.6, row: 1.2 });
    free.made.letGo();
    assert.deepStrictEqual(free.at(), { column: 2.6, row: 1.2 });
  });
});
