import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { adjacentTab, Cycle } from '../../../../lib/page/tabCycle';

suite('Stepping through tabs', () => {
  const tabs = ['a', 'b', 'c'].map((name) => ({
    id: `/${name}`,
    tool: 'git' as const,
    root: `/${name}`,
    name,
  }));

  test('wraps around at either end, and stays put with one tab', () => {
    assert.strictEqual(adjacentTab(tabs, '/a', 1), '/b');
    assert.strictEqual(adjacentTab(tabs, '/c', 1), '/a');
    assert.strictEqual(adjacentTab(tabs, '/a', -1), '/c');
    assert.strictEqual(adjacentTab(tabs, undefined, 1), '/a');
    assert.strictEqual(adjacentTab(tabs.slice(0, 1), '/a', 1), undefined);
  });

  test('steps on from the tab it last asked for until that one shows, as a key held down repeats faster than tabs open, and from the one shown once another is picked', () => {
    let cycle = new Cycle();
    const next = (active: string) =>
      cycle.next(active, (from: string | undefined) =>
        adjacentTab(tabs, from, 1),
      );
    assert.strictEqual(next('/a'), '/b');
    assert.strictEqual(next('/a'), '/c');
    assert.strictEqual(next('/b'), '/a');
    assert.strictEqual(next('/c'), '/b');
    assert.strictEqual(next('/a'), '/c');
    cycle = new Cycle();
    assert.strictEqual(next('/a'), '/b');
    assert.strictEqual(next('/c'), '/a');
  });

  test('steps on from the tab shown once the one asked for shows and another is picked, though it is the one shown at the last press', () => {
    for (const shown of [tabs, tabs.slice(0, 2)]) {
      const cycle = new Cycle();
      const next = (active: string) =>
        cycle.next(active, (from: string | undefined) =>
          adjacentTab(shown, from, 1),
        );
      cycle.seen('/a');
      assert.strictEqual(next('/a'), '/b');
      cycle.seen('/b');
      cycle.seen('/a');
      assert.strictEqual(next('/a'), '/b');
    }
  });
});
