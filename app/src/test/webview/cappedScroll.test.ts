import * as assert from 'node:assert';
import {
  homeReal,
  homeVirtual,
  realHeight,
  scrollCap,
  scrolled,
  scrolledTo,
  type ScrollAnchor,
  type ScrollRange,
} from '../../webview/cappedScroll';

const viewport = 500;
const long: ScrollRange = { total: 1_300_000 * 50, viewport };
const realMax = scrollCap - viewport;
const virtualMax = long.total - viewport;
const top: ScrollAnchor = { real: 0, base: 0 };

const virtualOf = (anchor: ScrollAnchor) => anchor.real + anchor.base;

function wheel(
  from: ScrollAnchor,
  step: number,
  range: ScrollRange,
): { at: ScrollAnchor; steps: number; moved: number } {
  const end = step > 0 ? range.total - range.viewport : 0;
  const max = realHeight(range.total) - range.viewport;
  let at = from;
  let steps = 0;
  let moved = 0;
  while (virtualOf(at) !== end && steps < 1_000_000) {
    const real = Math.min(max, Math.max(0, at.real + step));
    at = scrolled(at, real, range);
    moved += at.real === real ? 0 : 1;
    steps++;
  }
  return { at, steps, moved };
}

suite('Capped scroll', () => {
  test('leaves a list short enough to scroll through as it is', () => {
    const range = { total: 100_000, viewport };
    assert.strictEqual(realHeight(range.total), range.total);
    assert.deepStrictEqual(scrolled(top, 4000, range), { real: 4000, base: 0 });
    assert.deepStrictEqual(scrolled(top, 90_000, range), {
      real: 90_000,
      base: 0,
    });
    assert.deepStrictEqual(scrolledTo(top, 90_000, range), {
      real: 90_000,
      base: 0,
    });
    assert.strictEqual(homeVirtual(1234, range), 1234);
    assert.strictEqual(homeReal(1234, range), 1234);
  });

  test('caps the height a long list scrolls through, below what Chromium can lay out', () => {
    assert.strictEqual(realHeight(long.total), scrollCap);
    assert.ok(scrollCap * 4 < 2 ** 31 / 64);
  });

  test('spreads the rows of a long list over its scroll range from end to end, in order', () => {
    assert.strictEqual(homeVirtual(0, long), 0);
    assert.strictEqual(homeVirtual(realMax, long), virtualMax);
    assert.strictEqual(homeReal(0, long), 0);
    assert.strictEqual(homeReal(virtualMax, long), realMax);
    let previous = -1;
    for (let real = 0; real <= realMax; real += realMax / 1000) {
      const virtual = homeVirtual(real, long);
      assert.ok(virtual > previous);
      assert.ok(Math.abs(homeReal(virtual, long) - real) < 1e-6);
      previous = virtual;
    }
  });

  test('jumps to any place in a long list exactly, within the height it scrolls through', () => {
    for (const target of [
      0,
      1,
      scrollCap,
      30_000_000,
      virtualMax - 1,
      virtualMax,
    ]) {
      const at = scrolledTo(top, target, long);
      assert.strictEqual(virtualOf(at), target);
      assert.ok(at.real >= 0 && at.real <= realMax);
    }
    assert.strictEqual(
      virtualOf(scrolledTo(top, virtualMax + 99, long)),
      virtualMax,
    );
  });

  test('scrolls a long list by as much as the wheel or a key moves it, rather than scaled up', () => {
    const jumped = scrolledTo(top, 30_000_000, long);
    const wheeled = scrolled(jumped, jumped.real + 100, long);
    assert.strictEqual(wheeled.base, jumped.base);
    assert.strictEqual(virtualOf(wheeled), 30_000_100);
    const paged = scrolledTo(wheeled, 30_000_100 - viewport, long);
    assert.strictEqual(paged.base, jumped.base);
    assert.strictEqual(paged.real, wheeled.real - viewport);
  });

  test('follows the scrollbar dragged along a long list in proportion, to either end', () => {
    const middle = scrolled(top, realMax / 2, long);
    assert.strictEqual(middle.real, realMax / 2);
    assert.strictEqual(virtualOf(middle), homeVirtual(realMax / 2, long));
    assert.ok(Math.abs(virtualOf(middle) - virtualMax / 2) < 1);
    assert.strictEqual(virtualOf(scrolled(middle, realMax, long)), virtualMax);
    assert.strictEqual(virtualOf(scrolled(middle, 0, long)), 0);
  });

  test('reaches the nearer end of a long list by scrolling on from a place jumped to, moving the scrollbar back at most twice', () => {
    for (const [start, step] of [
      [150_000, -100],
      [3_000_000, -100],
      [virtualMax - 3_000_000, 100],
      [virtualMax - 150_000, 100],
    ]) {
      const { at, steps, moved } = wheel(
        scrolledTo(top, start, long),
        step,
        long,
      );
      const distance = step > 0 ? virtualMax - start : start;
      assert.strictEqual(virtualOf(at), step > 0 ? virtualMax : 0);
      assert.ok(moved <= 2, `${start}: ${moved}`);
      assert.ok(steps <= distance / Math.abs(step) + 2 * moved + 1);
    }
  });

  test('scrolls a long list on from a place jumped to by as much as the wheel moves it, for a good while either way', () => {
    for (const step of [100, -100]) {
      let at = scrolledTo(top, 30_000_000, long);
      for (let count = 0; count < 10_000; count++) {
        const real = at.real + step;
        at = scrolled(at, real, long);
        assert.strictEqual(at.real, real);
      }
      assert.strictEqual(virtualOf(at), 30_000_000 + step * 10_000);
    }
  });

  test('keeps showing the end of a long list as it gets shorter, and its place once it fits', () => {
    const end = scrolledTo(top, virtualMax, long);
    const shorter = { total: long.total - 1000, viewport };
    assert.strictEqual(
      virtualOf(scrolled(end, end.real, shorter)),
      shorter.total - viewport,
    );
    const short = { total: 1_000_000, viewport };
    assert.deepStrictEqual(scrolled(end, 2000, short), { real: 2000, base: 0 });
    assert.deepStrictEqual(scrolledTo(end, 300_000, short), {
      real: 300_000,
      base: 0,
    });
  });
});
