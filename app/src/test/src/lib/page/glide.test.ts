import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  alongLine,
  gliderOf,
  rowGlide,
  type GlideClock,
} from '../../../../lib/page/glide';

function clocked() {
  let now = 0;
  let frames: (() => void)[] = [];
  const clock: GlideClock = {
    now: () => now,
    frame: (step) => frames.push(step),
    cancel: () => {
      frames = [];
    },
  };
  const at = (time: number) => {
    now = time;
  };
  const step = (time: number) => {
    now = time;
    const due = frames;
    frames = [];
    for (const frame of due) {
      frame();
    }
  };
  return { clock, at, step, waiting: () => frames.length };
}

suite('Glide', () => {
  test('glides to where it aims in a moment, easing out, and from where it is on to a new aim, ending on it exactly', () => {
    const { clock, at, step, waiting } = clocked();
    const placed: number[] = [];
    const glider = gliderOf((to) => placed.push(to), alongLine, clock);
    glider.glideTo(0.3, 0.1);
    step(rowGlide / 2);
    const [halfway = 0] = placed.slice(-1);
    assert.ok(halfway > 0.2 && halfway < 0.3, String(halfway));
    at(rowGlide / 2);
    glider.glideTo(0.7, 5);
    step(rowGlide / 2);
    assert.strictEqual(placed.at(-1), halfway);
    step(rowGlide * 1.5);
    assert.strictEqual(placed.at(-1), 0.7);
    assert.strictEqual(glider.target(), undefined);
    assert.strictEqual(waiting(), 0);
  });

  test('spreads a glide over its frames, never moving more than a quarter of the way in one frame of a display at 60 Hz, as most of it in the first frame looks like a jump that then lags', () => {
    const { clock, step } = clocked();
    const placed: number[] = [0];
    const glider = gliderOf((to) => placed.push(to), alongLine, clock);
    glider.glideTo(1000, 0);
    const frame = 1000 / 60;
    for (let time = frame; time < rowGlide + frame; time += frame) {
      step(time);
    }
    placed.slice(1).forEach((place, index) => {
      assert.ok(
        place - (placed[index] ?? 0) <= 250,
        `${place - (placed[index] ?? 0)} at frame ${index}`,
      );
    });
    assert.strictEqual(placed.at(-1), 1000);
  });

  test('stops where it is once settled, leaving no frame waiting, and lets what it places settle it or aim it anew, as a list that reaches its end does', () => {
    const { clock, step, waiting } = clocked();
    const placed: number[] = [];
    const glider = gliderOf(
      (to) => {
        placed.push(to);
        if (to > 50) {
          glider.settle();
        }
      },
      alongLine,
      clock,
    );
    glider.glideTo(100, 0);
    step(rowGlide / 2);
    assert.strictEqual(glider.target(), undefined);
    assert.strictEqual(waiting(), 0);
    assert.strictEqual(placed.length, 1);
  });

  test('glides every axis of a point at once, as the canvas pans across and down', () => {
    const { clock, step } = clocked();
    const placed: { column: number; row: number }[] = [];
    const glider = gliderOf(
      (to: { column: number; row: number }) => placed.push(to),
      (from, to, share) => ({
        column: alongLine(from.column, to.column, share),
        row: alongLine(from.row, to.row, share),
      }),
      clock,
    );
    glider.glideTo({ column: 10, row: -4 }, { column: 0, row: 0 });
    step(rowGlide / 2);
    step(rowGlide);
    assert.strictEqual(placed.length, 2);
    assert.ok((placed[0]?.column ?? 0) > 5 && (placed[0]?.row ?? 0) < -2);
    assert.deepStrictEqual(placed[1], { column: 10, row: -4 });
  });
});
