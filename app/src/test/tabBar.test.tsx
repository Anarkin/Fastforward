import * as assert from 'node:assert';
import { mock } from 'node:test';
import { isValidElement } from 'react';
import type { ContextMenuItem } from '../webview/contextMenu';
import { adjacentTab, resting, TabBar } from '../webview/tabBar';
import { rested } from './componentFixtures';
import { noop, renderedBy } from './fixtures';

const noKeys = {
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
};

suite('Tab bar', () => {
  teardown(() => mock.timers.reset());

  const tabs = ['a', 'b', 'c'].map((name) => ({ root: `/${name}`, name }));

  test('wraps around at either end, and stays put with one tab', () => {
    assert.strictEqual(adjacentTab(tabs, '/a', 1), '/b');
    assert.strictEqual(adjacentTab(tabs, '/c', 1), '/a');
    assert.strictEqual(adjacentTab(tabs, '/a', -1), '/c');
    assert.strictEqual(adjacentTab(tabs, undefined, 1), '/a');
    assert.strictEqual(adjacentTab(tabs.slice(0, 1), '/a', 1), undefined);
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

  test('offers sorting the tabs, opening the settings files and showing the shortcuts in its menu', () => {
    const picked: string[] = [];
    const nav = renderedBy(TabBar, {
      tabs: [],
      active: undefined,
      onSelect: noop,
      onPreload: noop,
      onClose: noop,
      onAdd: noop,
      onSort: () => picked.push('sort'),
      onOpenSettings: () => picked.push('settings'),
      onOpenDefaultSettings: () => picked.push('defaults'),
      onShowShortcuts: () => picked.push('shortcuts'),
      onLog: noop,
    });
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(nav));
    const menu = nav.props.children[1];
    assert.ok(isValidElement<{ items: readonly ContextMenuItem[] }>(menu));
    const items = menu.props.items.flatMap((item) =>
      'separator' in item ? [] : [item],
    );
    assert.deepStrictEqual(
      items.map((item) => item.label),
      [
        'Sort A-Z',
        'Open Default Settings',
        'Open User Settings',
        'Keyboard Shortcuts',
      ],
    );
    for (const item of items) {
      item.onClick?.();
    }
    assert.deepStrictEqual(picked, [
      'sort',
      'defaults',
      'settings',
      'shortcuts',
    ]);
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
      onSort: noop,
      onOpenSettings: noop,
      onOpenDefaultSettings: noop,
      onShowShortcuts: noop,
      onLog: noop,
    });
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(nav));
    const list = nav.props.children[0];
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
    tab.props.onMouseDown({ button: 0, ...noKeys, preventDefault });
    assert.strictEqual(prevented, 0);
    tab.props.onMouseDown({ button: 1, ...noKeys, preventDefault });
    assert.strictEqual(prevented, 1);
    tab.props.onAuxClick({ button: 1, ...noKeys });
    assert.deepStrictEqual(closed, ['/repo']);
  });

  test('preloads only a tab not shown that the pointer rests on, and closes one only by its button or the middle button', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
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
      onSort: noop,
      onOpenSettings: noop,
      onOpenDefaultSettings: noop,
      onShowShortcuts: noop,
      onLog: noop,
    });
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(nav));
    const list = nav.props.children[0];
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
    b.props.onAuxClick({ button: 2, ...noKeys });
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
