import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { SavedTab } from '../../../../shell/main/storage';
import { TabHistory } from '../../../../shell/main/tabHistory';
import {
  nextTabId,
  nextWindowId,
  spareWindowIds,
  withActive,
  withChanged,
  withClosed,
  withMoved,
  withOpened,
  type Layout,
} from '../../../../shell/main/windows';

const tab = (id: string): SavedTab => ({ id, tool: 'terminal' });

function layoutOf(
  ...windows: (readonly [string, readonly string[], string?])[]
): Layout {
  return windows.map(([id, tabs, active]) => ({
    id,
    tabs: tabs.map(tab),
    ...(active !== undefined && { active }),
  }));
}

function shapeOf(layout: Layout): (readonly [string, string[], string?])[] {
  return layout.map((window) =>
    window.active === undefined
      ? [window.id, window.tabs.map((each) => each.id)]
      : [window.id, window.tabs.map((each) => each.id), window.active],
  );
}

function historyOf(...visits: string[]): TabHistory {
  const history = new TabHistory();
  for (const visit of visits) {
    history.visit(visit);
  }
  return history;
}

suite('Windows of tabs', () => {
  test('gives a new tab an id no tab of any window has, as the tools know a tab by its id alone', () => {
    assert.strictEqual(
      nextTabId(layoutOf(['1', ['1', '7']], ['2', ['3', '12']])),
      '13',
    );
    assert.strictEqual(nextTabId(layoutOf(['1', []])), '1');
  });

  test('gives a new window an id no window has', () => {
    assert.strictEqual(nextWindowId(layoutOf(['1', []], ['4', []])), '5');
    assert.strictEqual(nextWindowId([]), '1');
  });

  test('gives each window kept ready for a tab torn off an id no window of the layout it starts from has, as a torn-off window keeps that id after a restart', () => {
    const next = spareWindowIds(layoutOf(['1', []], ['s1', []], ['s3', []]));
    assert.deepStrictEqual([next(), next()], ['s4', 's5']);
    assert.strictEqual(spareWindowIds(layoutOf(['1', []]))(), 's1');
  });

  test('opens tabs at the end of the window asked, leaving the others as they were', () => {
    const opened = withOpened(
      layoutOf(['1', ['1'], '1'], ['2', ['2'], '2']),
      '2',
      [tab('3'), tab('4')],
    );
    assert.deepStrictEqual(shapeOf(opened), [
      ['1', ['1'], '1'],
      ['2', ['2', '3', '4'], '2'],
    ]);
  });

  test('keeps the active tab of each window apart', () => {
    const layout = layoutOf(['1', ['1', '2'], '1'], ['2', ['3', '4'], '3']);
    assert.deepStrictEqual(shapeOf(withActive(layout, '2', '4')), [
      ['1', ['1', '2'], '1'],
      ['2', ['3', '4'], '4'],
    ]);
  });

  test('changes a tab where it is, in whichever window holds it', () => {
    const changed = withChanged(layoutOf(['1', ['1']], ['2', ['2', '3']]), {
      id: '3',
      tool: 'terminal',
      root: '/home',
    });
    assert.deepStrictEqual(changed[1]?.tabs[1], {
      id: '3',
      tool: 'terminal',
      root: '/home',
    });
    assert.deepStrictEqual(shapeOf(changed), [
      ['1', ['1']],
      ['2', ['2', '3']],
    ]);
  });

  test('shows the tab shown before in the same window once the active one closes, never a tab of another window', () => {
    const closed = withClosed(
      layoutOf(['1', ['1', '2', '3'], '3'], ['2', ['4'], '4']),
      '3',
      historyOf('1', '4', '3'),
    );
    assert.deepStrictEqual(shapeOf(closed), [
      ['1', ['1', '2'], '1'],
      ['2', ['4'], '4'],
    ]);
  });

  test('leaves the active tab of a window as it was when another of its tabs closes', () => {
    const closed = withClosed(
      layoutOf(['1', ['1', '2', '3'], '3']),
      '1',
      historyOf('1', '3'),
    );
    assert.deepStrictEqual(shapeOf(closed), [['1', ['2', '3'], '3']]);
  });

  test('closes a window once its last tab closes, unless it is the only window, which stays open and empty', () => {
    const layout = layoutOf(['1', ['1'], '1'], ['2', ['2'], '2']);
    const one = withClosed(layout, '2', historyOf('2'));
    assert.deepStrictEqual(shapeOf(one), [['1', ['1'], '1']]);
    assert.deepStrictEqual(shapeOf(withClosed(one, '1', historyOf('1'))), [
      ['1', []],
    ]);
  });

  test('moves a tab within its window to the place asked, leaving the active tab as it was', () => {
    const moved = withMoved(
      layoutOf(['1', ['1', '2', '3'], '2']),
      '1',
      '1',
      2,
      historyOf('2'),
    );
    assert.deepStrictEqual(shapeOf(moved), [['1', ['2', '3', '1'], '2']]);
  });

  test('moves a tab into another window at the place asked and shows it there, showing in the window it left the tab shown before it', () => {
    const moved = withMoved(
      layoutOf(['1', ['1', '2', '3'], '3'], ['2', ['4', '5'], '4']),
      '3',
      '2',
      1,
      historyOf('1', '3'),
    );
    assert.deepStrictEqual(shapeOf(moved), [
      ['1', ['1', '2'], '1'],
      ['2', ['4', '3', '5'], '3'],
    ]);
  });

  test('closes the window a tab leaves when it was its only tab', () => {
    const moved = withMoved(
      layoutOf(['1', ['1'], '1'], ['2', ['2'], '2']),
      '1',
      '2',
      0,
      historyOf('1'),
    );
    assert.deepStrictEqual(shapeOf(moved), [['2', ['1', '2'], '1']]);
  });

  test('keeps the window a dragged tab leaves though it holds no tab, so the drag can bring the tab back into it', () => {
    const moved = withMoved(
      layoutOf(['1', ['1'], '1'], ['2', ['2'], '2']),
      '1',
      '2',
      0,
      historyOf('1'),
      'kept',
    );
    assert.deepStrictEqual(shapeOf(moved), [
      ['1', []],
      ['2', ['1', '2'], '1'],
    ]);
  });

  test('puts a tab moved past the end of a window at its end', () => {
    const moved = withMoved(
      layoutOf(['1', ['1', '2'], '1'], ['2', ['3'], '3']),
      '1',
      '2',
      9,
      historyOf('1'),
    );
    assert.deepStrictEqual(shapeOf(moved), [
      ['1', ['2'], '2'],
      ['2', ['3', '1'], '1'],
    ]);
  });

  test('leaves the windows as they were when the tab or the window asked is gone', () => {
    const layout = layoutOf(['1', ['1', '2'], '1']);
    assert.strictEqual(withClosed(layout, '9', historyOf()), layout);
    assert.strictEqual(withMoved(layout, '9', '1', 0, historyOf()), layout);
    assert.strictEqual(withMoved(layout, '1', '9', 0, historyOf()), layout);
    assert.strictEqual(withOpened(layout, '9', [tab('3')]), layout);
  });
});
