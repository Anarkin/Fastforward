import * as assert from 'node:assert';
import { workingTreeHash } from '../shared/protocol';
import {
  commitsMessage,
  firstPage,
  keep,
  keepSubjects,
  layOutHistory,
  loadHistory,
  navigationEntry,
  nearestSteps,
  newTabState,
  positionOf,
  replayOf,
  select,
} from '../tabState';
import { commitInfo } from './fixtures';

suite('Tab state', () => {
  const history = [
    { hash: 'c', parents: ['a', 'b'] },
    { hash: 'b', parents: ['a'] },
    { hash: 'a', parents: [] },
  ];
  const long = Array.from({ length: 250 }, (_, i) => ({
    hash: `h${i}`,
    parents: i < 249 ? [`h${i + 1}`] : [],
  }));

  function laidOut(entries = long) {
    const tab = newTabState();
    loadHistory(tab, entries, undefined, []);
    layOutHistory(tab, false, undefined);
    return tab;
  }

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

  test('starts the first page at the page of the commit that keeps its place', () => {
    const tab = laidOut();
    tab.anchor = { hash: 'h150', offset: 3 };
    assert.deepStrictEqual(firstPage(tab, true), {
      start: 100,
      scrollTarget: { index: 150, offset: 3 },
    });
    assert.deepStrictEqual(firstPage(tab, false), {
      start: 0,
      scrollTarget: undefined,
    });
    tab.anchor = { hash: workingTreeHash, offset: 7 };
    assert.deepStrictEqual(firstPage(tab, true), {
      start: 0,
      scrollTarget: { index: -1, offset: 0 },
    });
    tab.anchor = { hash: 'gone', offset: 0 };
    assert.deepStrictEqual(firstPage(tab, true), {
      start: 0,
      scrollTarget: undefined,
    });
  });

  test('starts the first page at the page of the commit to scroll to, or else of the selected one', () => {
    const tab = laidOut();
    assert.deepStrictEqual(firstPage(tab, false, 'h150'), {
      start: 100,
      scrollTarget: { index: 150 },
    });
    tab.hash = 'h220';
    layOutHistory(tab, false, undefined);
    assert.deepStrictEqual(firstPage(tab, false), {
      start: 200,
      scrollTarget: { index: 220 },
    });
  });

  test('sends the selected commit apart from the one to scroll to', () => {
    const tab = laidOut(history);
    select(tab, 'a', 2);
    const message = commitsMessage(tab, firstPage(tab, false, 'b'), []);
    assert.strictEqual(message.selectedIndex, 2);
    assert.deepStrictEqual(message.scrollTarget, { index: 1 });
  });

  test('replays the commits at the selected commit and the one that keeps its place', () => {
    const tab = laidOut();
    keep(tab.shown, commitsMessage(tab, firstPage(tab, false, 'h0'), []));
    select(tab, 'h5', 5);
    tab.anchor = { hash: 'h9', offset: 2 };
    const replayed = replayOf(tab).find(
      (message) => message.type === 'commits',
    );
    assert.strictEqual(replayed?.selectedIndex, 5);
    assert.deepStrictEqual(replayed.scrollTarget, { index: 9, offset: 2 });
  });

  test('keeps the working tree selected at index -1 when the history is laid out again', () => {
    const tab = newTabState();
    loadHistory(tab, history, { name: 'main', commit: 'c' }, []);
    tab.hash = workingTreeHash;
    layOutHistory(tab, true, 'c');
    assert.strictEqual(tab.index, -1);
  });

  test('leaves no index for a selected commit that collapsing hides', () => {
    const tab = newTabState();
    loadHistory(tab, history, { name: 'main', commit: 'c' }, []);
    tab.hash = 'b';
    layOutHistory(tab, true, 'c');
    assert.strictEqual(tab.index, undefined);
  });

  test('places the working tree above the first commit', () => {
    const tab = laidOut(history);
    assert.strictEqual(positionOf(tab, workingTreeHash), -1);
    assert.strictEqual(positionOf(tab, undefined), undefined);
  });

  test('names navigation entries after their subjects', () => {
    const tab = newTabState();
    keepSubjects(tab, [commitInfo('b', { subject: 'bee' })]);
    assert.strictEqual(navigationEntry(tab, 'b').subject, 'bee');
    assert.strictEqual(
      navigationEntry(tab, workingTreeHash).subject,
      'Uncommitted changes',
    );
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
