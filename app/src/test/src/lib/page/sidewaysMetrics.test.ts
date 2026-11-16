import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { thumbBox, thumbOf } from '../../../../lib/page/scrollbarGeometry';
import {
  sidewaysMetrics,
  sidewaysScroll,
} from '../../../../lib/page/sidewaysMetrics';

suite('Sideways metrics', () => {
  const scroller = {
    left: 100,
    top: 50,
    clientLeft: 1,
    clientTop: 1,
    clientWidth: 400,
    clientHeight: 500,
    scrollWidth: 800,
    scrollHeight: 1000,
    scrollLeft: 200,
    scrollTop: 250,
  };

  test('measures the two sides of a side by side diff, scrolled together, as one area scrolled across the whole width', () => {
    const sides = sidewaysMetrics(
      { ...scroller, clientWidth: 1000, scrollWidth: 1000, scrollLeft: 0 },
      400,
      400,
      200,
    );
    assert.strictEqual(sides.scrollWidth, 2000);
    assert.strictEqual(sides.scrollLeft, 500);
    assert.deepStrictEqual(thumbOf(sides.scrollWidth, sides.clientWidth, 500), {
      offset: 250,
      length: 500,
    });
    assert.strictEqual(sidewaysScroll(500, 1000, 400), 200);
  });

  test('measures two sides that fit, or have no width, as not scrolling', () => {
    const fitting = { ...scroller, clientWidth: 1000, scrollWidth: 1000 };
    for (const [side, widest] of [
      [400, 0],
      [0, 400],
    ]) {
      const sides = sidewaysMetrics(fitting, side, widest, 0);
      assert.strictEqual(thumbBox('horizontal', sides, 25), undefined);
    }
    assert.strictEqual(sidewaysScroll(500, 1000, 0), 0);
    assert.strictEqual(sidewaysScroll(500, 0, 400), 0);
  });
});
