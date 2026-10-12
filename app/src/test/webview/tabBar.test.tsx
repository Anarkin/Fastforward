import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { afterEach, suite, test, vi } from 'vitest';
import { adjacentTab, Cycle, resting, TabBar } from '../../webview/tabBar';
import { rested } from '../componentFixtures';
import { noModifiers, noop, renderedBy } from '../fixtures';

suite('Tab bar', () => {
  afterEach(() => vi.useRealTimers());

  const tabs = ['a', 'b', 'c'].map((name) => ({ root: `/${name}`, name }));

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

  test('acts on what the pointer rests on, not on what it only passes over', async () => {
    const done: string[] = [];
    const rest = resting(10);
    rest.start(() => done.push('a'));
    rest.start(() => done.push('b'));
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepStrictEqual(done, ['b']);
    rest.start(() => done.push('c'));
    rest.cancel();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepStrictEqual(done, ['b']);
  });

  test('stops the middle button from autoscrolling, so a middle click closes the tab', () => {
    const closed: string[] = [];
    const nav = renderedBy(TabBar, {
      tabs: [{ root: '/repo', name: 'repo' }],
      active: '/repo',
      onSelect: noop,
      onPreload: noop,
      onClose: (root) => closed.push(root),
      onAdd: noop,
      onLog: noop,
    });
    assert.ok(isValidElement<{ children: React.ReactElement }>(nav));
    const list = nav.props.children;
    assert.ok(isValidElement<{ children: React.ReactElement[][] }>(list));
    const tab = list.props.children[0][0];
    assert.ok(
      isValidElement<{
        onMouseDown: (event: {
          button: number;
          preventDefault: () => void;
        }) => void;
        onAuxClick: (event: { button: number }) => void;
      }>(tab),
    );
    let prevented = 0;
    const preventDefault = () => prevented++;
    tab.props.onMouseDown({ button: 0, ...noModifiers, preventDefault });
    assert.strictEqual(prevented, 0);
    tab.props.onMouseDown({ button: 1, ...noModifiers, preventDefault });
    assert.strictEqual(prevented, 1);
    tab.props.onAuxClick({ button: 1, ...noModifiers });
    assert.deepStrictEqual(closed, ['/repo']);
  });

  test('closes a tab by its button without the button taking focus, as it goes and would leave the keys with nothing', () => {
    const nav = renderedBy(TabBar, {
      tabs: [{ root: '/repo', name: 'repo' }],
      active: '/repo',
      onSelect: noop,
      onPreload: noop,
      onClose: noop,
      onAdd: noop,
      onLog: noop,
    });
    assert.ok(isValidElement<{ children: React.ReactElement }>(nav));
    const list = nav.props.children;
    assert.ok(isValidElement<{ children: React.ReactElement[][] }>(list));
    const tab = list.props.children[0][0];
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(tab));
    const close = tab.props.children[1];
    assert.ok(
      isValidElement<{
        onMouseDown: (event: { preventDefault: () => void }) => void;
      }>(close),
    );
    let prevented = 0;
    close.props.onMouseDown({ preventDefault: () => prevented++ });
    assert.strictEqual(prevented, 1);
  });

  test('preloads only a tab not shown that the pointer rests on, and closes one only by its button or the middle button', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const preloaded: string[] = [];
    const closed: string[] = [];
    const nav = renderedBy(TabBar, {
      tabs: [
        { root: '/a', name: 'a' },
        { root: '/b', name: 'b' },
      ],
      active: '/a',
      onSelect: noop,
      onPreload: (root) => preloaded.push(root),
      onClose: (root) => closed.push(root),
      onAdd: noop,
      onLog: noop,
    });
    assert.ok(isValidElement<{ children: React.ReactElement }>(nav));
    const list = nav.props.children;
    assert.ok(isValidElement<{ children: React.ReactElement[][] }>(list));
    const [a, b] = list.props.children[0];
    type Tab = {
      onPointerEnter: () => void;
      onPointerLeave: () => void;
      onClick: () => void;
      onAuxClick: (event: { button: number }) => void;
      children: React.ReactElement[];
    };
    assert.ok(isValidElement<Tab>(a) && isValidElement<Tab>(b));
    a.props.onPointerEnter();
    rested();
    assert.deepStrictEqual(preloaded, []);
    b.props.onPointerEnter();
    b.props.onPointerLeave();
    rested();
    b.props.onPointerEnter();
    b.props.onClick();
    rested();
    assert.deepStrictEqual(preloaded, []);
    b.props.onPointerEnter();
    rested();
    assert.deepStrictEqual(preloaded, ['/b']);
    b.props.onAuxClick({ button: 2, ...noModifiers });
    assert.deepStrictEqual(closed, []);
    const close = a.props.children[1];
    assert.ok(
      isValidElement<{
        onClick: (event: { stopPropagation: () => void }) => void;
      }>(close),
    );
    let stopped = 0;
    close.props.onClick({ stopPropagation: () => stopped++ });
    assert.strictEqual(stopped, 1);
    assert.deepStrictEqual(closed, ['/a']);
  });
});
