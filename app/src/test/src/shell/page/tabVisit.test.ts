import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { visitedSlot } from '../../../../shell/page/tabVisit';

suite('Tabs dragged', () => {
  test('shows a tab dragged in from another window in the place its left edge comes nearest, under the pointer', () => {
    assert.deepStrictEqual(visitedSlot([100, 100], 10, 0), {
      index: 0,
      shift: 0,
    });
    assert.deepStrictEqual(visitedSlot([100, 100], 10, 60), {
      index: 1,
      shift: -50,
    });
    assert.deepStrictEqual(visitedSlot([100, 100], 10, 500), {
      index: 2,
      shift: 0,
    });
    assert.deepStrictEqual(visitedSlot([], 10, 40), { index: 0, shift: 0 });
  });
});
