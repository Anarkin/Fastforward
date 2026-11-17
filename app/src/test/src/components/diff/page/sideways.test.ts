import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { glideAt, glideEnded } from '../../../../../lib/page/glide';
import { glideBy } from '../../../../../components/diff/page/sideways';

suite('Side-by-side diff', () => {
  test('glides sideways to where a wheel tick leads, easing out', () => {
    const glide = glideBy(undefined, 0, 1000, 100, 120, 500);
    assert.strictEqual(glideAt(glide, 1000), 0);
    const halfway = glideAt(glide, 1060);
    assert.ok(halfway > 50 && halfway < 100, `${halfway}`);
    assert.strictEqual(glideAt(glide, 1120), 100);
    assert.strictEqual(glideAt(glide, 2000), 100);
    assert.ok(!glideEnded(glide, 1119));
    assert.ok(glideEnded(glide, 1120));
  });

  test('glides on from where it is to further along, as wheel ticks come during a glide', () => {
    const first = glideBy(undefined, 0, 0, 100, 120, 500);
    const second = glideBy(first, 0, 60, 100, 120, 500);
    assert.strictEqual(second.from, glideAt(first, 60));
    assert.strictEqual(second.to, 200);
    assert.strictEqual(glideAt(second, 60), glideAt(first, 60));
    assert.strictEqual(glideAt(second, 180), 200);
  });

  test('stops each wheel tick in turn at either end, no further than the widest line', () => {
    const right = glideBy(undefined, 90, 0, 30, 120, 100);
    assert.strictEqual(right.to, 100);
    assert.strictEqual(glideBy(right, 90, 0, -30, 120, 100).to, 70);
    assert.strictEqual(glideBy(undefined, 10, 0, -30, 120, 100).to, 0);
    assert.strictEqual(glideBy(undefined, 0, 0, 30, 120, 0).to, 0);
  });

  test('moves at once by a swipe', () => {
    const glide = glideBy(undefined, 40, 1000, 20, 0, 100);
    assert.strictEqual(glideAt(glide, 1000), 60);
    assert.ok(glideEnded(glide, 1000));
  });
});
