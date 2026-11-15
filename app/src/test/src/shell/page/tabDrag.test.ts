import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  movedTab,
  nearestSlot,
  slotLefts,
  tornOut,
} from '../../../../shell/page/tabDrag';

function roots(tabs: readonly { id: string }[]): string[] {
  return tabs.map((tab) => tab.id);
}

suite('Tabs dragged', () => {
  test('puts a tab dragged in the place its left edge comes nearest, so it takes the place of a tab once it passes its middle, as in Chrome', () => {
    const lefts = slotLefts([100, 100, 100], 10, 0);
    assert.deepStrictEqual(lefts, [0, 110, 220]);
    assert.strictEqual(nearestSlot(lefts, 0), 0);
    assert.strictEqual(nearestSlot(lefts, 54), 0);
    assert.strictEqual(nearestSlot(lefts, 56), 1);
    assert.strictEqual(nearestSlot(lefts, 164), 1);
    assert.strictEqual(nearestSlot(lefts, 166), 2);
    assert.strictEqual(nearestSlot(lefts, 400), 2);
    assert.strictEqual(nearestSlot(lefts, -40), 0);
  });

  test('places a tab dragged among the others as wide as they are, though it is wider, as the open tab is once the tabs shrink', () => {
    assert.deepStrictEqual(slotLefts([40, 80, 40], 6, 1), [0, 46, 92]);
    assert.deepStrictEqual(slotLefts([80, 40, 30], 6, 0), [0, 46, 82]);
  });

  test('moves a tab to the place it is dropped in, keeping the others in their order', () => {
    const four = ['a', 'b', 'c', 'd'].map((name) => ({
      id: `/${name}`,
      name,
    }));
    assert.deepStrictEqual(roots(movedTab(four, '/a', 2)), [
      '/b',
      '/c',
      '/a',
      '/d',
    ]);
    assert.deepStrictEqual(roots(movedTab(four, '/d', 0)), [
      '/d',
      '/a',
      '/b',
      '/c',
    ]);
    assert.deepStrictEqual(roots(movedTab(four, '/x', 0)), roots(four));
  });

  test('tears a tab off once the pointer leaves the row of tabs by more than a little, above or below it', () => {
    const row = { top: 0, bottom: 32 };
    assert.strictEqual(tornOut(row, 40), false);
    assert.strictEqual(tornOut(row, 48), true);
    assert.strictEqual(tornOut(row, -14), false);
    assert.strictEqual(tornOut(row, -16), true);
  });
});
