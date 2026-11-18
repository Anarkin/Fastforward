import * as assert from 'node:assert';
import { suite, test, vi } from 'vitest';
import { holdRest } from '../../../../../lib/page/scrollSettings';
import { glideRowsOf } from '../../../../../tools/viewer/page/rowGlide';

function gliding({ atStart = false, atEnd = false, settles = true } = {}) {
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
  let rows = 0;
  let shifted = 0;
  const seen: [number, number][] = [];
  const glider = glideRowsOf({
    move: (by) => {
      rows += by;
    },
    shift: (part) => {
      shifted = part;
    },
    atStart: () => atStart,
    atEnd: () => atEnd,
    settles: () => settles,
  });
  return {
    glider,
    rows: () => rows,
    shifted: () => shifted,
    seen,
    run: () => {
      for (let step = 0; step < 60 && frames.length > 0; step++) {
        now += 16;
        for (const frame of frames.splice(0)) {
          frame();
        }
        seen.push([rows, Math.round(shifted * 100) / 100]);
      }
    },
    rest: () => vi.advanceTimersByTime(holdRest),
    close: () => {
      glider.stop();
      vi.useRealTimers();
      Object.assign(globalThis, saved);
    },
  };
}

suite('Gliding the rows of a file viewed', () => {
  test('glides a file viewed by the rows asked for, moving a whole row at a time and the rows by the part of a row between, up as down, to end on whole rows with nothing left shifted, as the viewer jumped there at once though scrolling was set to glide', () => {
    for (const by of [10, -10]) {
      const { glider, rows, shifted, seen, run, close } = gliding();
      try {
        glider.glideBy(by);
        const atOnce = rows();
        run();
        const between = seen.slice(0, -1);

        assert.strictEqual(atOnce, 0);
        assert.ok(between.length > 3, String(between.length));
        assert.ok(
          between.some(([, part]) => part > 0 && part < 1),
          JSON.stringify(seen),
        );
        assert.ok(
          between.every(([, part]) => part >= 0 && part < 1),
          JSON.stringify(seen),
        );
        assert.deepStrictEqual([rows(), shifted()], [by, 0]);
      } finally {
        close();
      }
    }
  });

  test('glides on from where it is to rows asked for meanwhile, a second notch adding to the first', () => {
    const { glider, rows, shifted, run, close } = gliding();
    try {
      glider.glideBy(10);
      glider.glideBy(10);
      run();

      assert.deepStrictEqual([rows(), shifted()], [20, 0]);
    } finally {
      close();
    }
  });

  test('moves by the part of a row a touchpad moved at once, and settles on the nearest whole row once it rests, unless set not to, where it stays between rows', () => {
    const { glider, rows, shifted, run, rest, close } = gliding();
    try {
      glider.holdBy(0.3);
      glider.holdBy(1.1);
      const held = [rows(), Math.round(shifted() * 100) / 100];
      rest();
      run();

      assert.deepStrictEqual(held, [1, 0.4]);
      assert.deepStrictEqual([rows(), shifted()], [1, 0]);
    } finally {
      close();
    }
    const free = gliding({ settles: false });
    try {
      free.glider.holdBy(0.3);
      free.rest();
      free.run();

      assert.deepStrictEqual(
        [free.rows(), Math.round(free.shifted() * 100) / 100],
        [0, 0.3],
      );
    } finally {
      free.close();
    }
  });

  test('shifts nothing past the start or the end of the file, where no row is left to move to', () => {
    const top = gliding({ atStart: true });
    try {
      top.glider.glideBy(-3);
      top.run();

      assert.deepStrictEqual([top.rows(), top.shifted()], [0, 0]);
      assert.ok(top.seen.every(([, part]) => part === 0));
    } finally {
      top.close();
    }
    const end = gliding({ atEnd: true });
    try {
      end.glider.holdBy(0.6);

      assert.deepStrictEqual([end.rows(), end.shifted()], [0, 0]);
    } finally {
      end.close();
    }
  });

  test('shifts the rows by the part of a row its scrollbar is held at, as often as it is held anew and with no row moved, and settles on a whole row once the scrollbar is let go, as a file viewed went a row at a time under a scrollbar dragged though scrolling was set to glide', () => {
    const { glider, rows, shifted, run, close } = gliding();
    try {
      glider.holdAt(0.25);
      const first = shifted();
      glider.holdAt(0.75);
      const second = shifted();
      glider.letGo();
      run();

      assert.deepStrictEqual([first, second], [0.25, 0.75]);
      assert.deepStrictEqual([rows(), shifted()], [1, 0]);
    } finally {
      close();
    }
  });
});
