import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { placedTip, tipGap } from '../../../../shell/page/tipPlace';

const view = { width: 1000, height: 600 };
const size = { width: 120, height: 24 };
const button = { left: 300, top: 40, width: 24, height: 24 };
const none = 0;

suite('The place of a tooltip', () => {
  test('is below its element by default, its left edge on that of the element, a gap under it, so the tooltip of a toolbar button covers none of the buttons beside it', () => {
    assert.deepStrictEqual(placedTip(button, size, view, 'below', none, 1), {
      left: 300,
      top: 64 + tipGap,
    });
  });

  test('is centered on its element or ends where it ends, where its owner asks', () => {
    assert.deepStrictEqual(
      [
        placedTip(button, size, view, 'below-center', none, 1),
        placedTip(button, size, view, 'below-end', none, 1),
        placedTip(button, size, view, 'above-center', none, 1),
        placedTip(button, size, view, 'above-end', none, 1),
      ],
      [
        { left: 300 + 12 - 60, top: 64 + tipGap },
        { left: 324 - 120, top: 64 + tipGap },
        { left: 300 + 12 - 60, top: 40 - tipGap - 24 },
        { left: 324 - 120, top: 40 - tipGap - 24 },
      ],
    );
  });

  test('goes above an element it has no room below, and below one it has no room above, rather than off the window', () => {
    const low = { ...button, top: 570 };
    assert.deepStrictEqual(placedTip(low, size, view, 'below', none, 1), {
      left: 300,
      top: 570 - tipGap - 24,
    });
    const high = { ...button, top: 10 };
    assert.deepStrictEqual(placedTip(high, size, view, 'above', none, 1), {
      left: 300,
      top: 34 + tipGap,
    });
  });

  test('stays inside the window, a little in from its edges, whatever its element and however wide it is', () => {
    const atRight = { ...button, left: 980 };
    assert.deepStrictEqual(placedTip(atRight, size, view, 'below', none, 1), {
      left: 1000 - 120 - 4,
      top: 64 + tipGap,
    });
    const wide = { width: 1200, height: 24 };
    assert.deepStrictEqual(placedTip(button, wide, view, 'below', none, 1), {
      left: 4,
      top: 64 + tipGap,
    });
    const tall = { width: 120, height: 900 };
    assert.deepStrictEqual(placedTip(button, tall, view, 'below', none, 1), {
      left: 300,
      top: 4,
    });
  });

  test('covers text cut short in place, its words starting where the words of its element start and as far down its lines, as Explorer shows a name too long for its column', () => {
    const cut = { left: 200, top: 100, width: 80, height: 18 };
    assert.deepStrictEqual(placedTip(cut, size, view, 'over', 9, 1), {
      left: 200 - 9,
      top: 100 + (18 - 24) / 2,
    });
  });

  test('stands on whole device pixels at every scale, so its edges and its text are sharp', () => {
    const between = { left: 300.3, top: 40.4, width: 24, height: 24 };
    const at125 = placedTip(between, size, view, 'below', none, 1.25);
    const at150 = placedTip(between, size, view, 'below', none, 1.5);
    for (const [placed, ratio] of [
      [at125, 1.25],
      [at150, 1.5],
    ] as const) {
      for (const value of [placed.left, placed.top]) {
        assert.ok(
          Math.abs(value * ratio - Math.round(value * ratio)) < 0.001,
          `${value} at ${ratio}`,
        );
      }
    }
  });
});
