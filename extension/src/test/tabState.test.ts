import * as assert from 'node:assert';
import { workingTreeHash } from '../shared/protocol';
import {
  firstPage,
  forgetHistory,
  historyLoaded,
  keep,
  layOutHistory,
  loadHistory,
  nearestSteps,
  newTabState,
  replayOf,
  select,
} from '../tabState';

suite('Tab state', () => {
  const history = [
    { hash: 'c', parents: ['a', 'b'] },
    { hash: 'b', parents: ['a'] },
    { hash: 'a', parents: [] },
  ];

  test('lays out the history with merges collapsed, keeping the selection', () => {
    const tab = newTabState();
    loadHistory(tab, history, { name: 'main', commit: 'c' }, []);
    tab.hash = 'a';
    const generation = layOutHistory(tab, true, 'c');
    assert.deepStrictEqual(
      tab.history.map((entry) => entry.hash),
      ['c', 'a'],
    );
    assert.strictEqual(tab.index, 1);
    assert.strictEqual(layOutHistory(tab, false, 'c'), generation + 1);
    assert.strictEqual(tab.index, 2);
  });

  test('keeps a merged branch in its collapsed merge though a ref points at it, unless HEAD is there', () => {
    const tab = newTabState();
    loadHistory(tab, history, { name: 'main', commit: 'c' }, [
      { kind: 'branch', name: 'feature', commit: 'b' },
    ]);
    layOutHistory(tab, true, 'c');
    assert.deepStrictEqual(
      tab.history.map((entry) => entry.hash),
      ['c', 'a'],
    );
    layOutHistory(tab, true, 'b');
    assert.deepStrictEqual(
      tab.history.map((entry) => entry.hash),
      ['c', 'b', 'a'],
    );
  });

  test('knows whether the history is loaded, until it is forgotten', () => {
    const tab = newTabState();
    assert.strictEqual(historyLoaded(tab), false);
    loadHistory(tab, history, { name: 'main', commit: 'c' }, []);
    assert.strictEqual(historyLoaded(tab), true);
    forgetHistory(tab);
    assert.strictEqual(historyLoaded(tab), false);
  });

  test('selects a commit at its position, dropping the selected file', () => {
    const tab = newTabState();
    loadHistory(tab, history, undefined, []);
    layOutHistory(tab, false, undefined);
    tab.path = 'x';
    select(tab, 'b');
    assert.deepStrictEqual(
      [tab.hash, tab.index, tab.path],
      ['b', 1, undefined],
    );
    select(tab, workingTreeHash);
    assert.strictEqual(tab.index, -1);
    select(tab, undefined);
    assert.deepStrictEqual([tab.hash, tab.index], [undefined, undefined]);
  });

  test('starts the first page at the commit that keeps its place', () => {
    const tab = newTabState();
    loadHistory(tab, history, undefined, []);
    layOutHistory(tab, false, undefined);
    tab.anchor = { hash: 'b', offset: 5 };
    assert.deepStrictEqual(firstPage(tab, true), {
      start: 0,
      anchor: { index: 1, offset: 5 },
    });
    assert.deepStrictEqual(firstPage(tab, false), {
      start: 0,
      anchor: undefined,
    });
  });

  test('replays the files before the diff or whole file that came last', () => {
    const tab = newTabState();
    keep(tab.shown, { type: 'diff', hash: 'a', path: 'x', patch: '' });
    keep(tab.shown, { type: 'files', hash: 'a', files: [] });
    keep(tab.shown, {
      type: 'fileContent',
      hash: 'a',
      path: 'y',
      content: '',
      binary: false,
    });
    keep(tab.shown, { type: 'error', message: 'once' });
    assert.deepStrictEqual(
      replayOf(tab).map((message) => message.type),
      ['files', 'fileContent'],
    );
  });

  test('lists no step to the commit shown in the dropdowns', () => {
    const tab = newTabState();
    loadHistory(tab, history, undefined, []);
    tab.hash = 'a';
    tab.navigation = { back: ['b', 'a'], forward: [] };
    assert.deepStrictEqual(nearestSteps(tab), { back: ['b'], forward: [] });
  });
});
