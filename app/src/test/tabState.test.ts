import * as assert from 'node:assert';
import { comparisonOf } from '../shared/comparisons';
import { workingTreeHash } from '../shared/protocol';
import {
  commitsMessage,
  expandMerges,
  firstPage,
  forgetHistory,
  historyLoaded,
  keep,
  keepSubjects,
  layOutHistory,
  loadHistory,
  mergesHidingCommit,
  navigationEntry,
  nearestSteps,
  newTabState,
  refsKeepHistory,
  replayOf,
  select,
  stillThere,
  toggleMerges,
} from '../tabState';
import { commitInfo } from './fixtures';

const at = (commit: string) => ({
  kind: 'branch' as const,
  name: commit,
  commit,
});

const page = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => commitInfo(`c${from + i}`));

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

  const pull = [
    { hash: 'p', parents: ['d', 'm'] },
    { hash: 'd', parents: ['base'] },
    { hash: 'm', parents: ['base', 'f'] },
    { hash: 'f', parents: ['base'] },
    { hash: 'base', parents: [] },
  ];

  test('expands a pull merge while merges are collapsed, until it is toggled', () => {
    const tab = newTabState();
    loadHistory(tab, pull, { name: 'main', commit: 'p' }, []);
    layOutHistory(tab, true, 'p');
    assert.deepStrictEqual(
      tab.history.map((entry) => entry.hash),
      ['p', 'd', 'm', 'base'],
    );
    toggleMerges(tab, ['p']);
    layOutHistory(tab, true, 'p');
    assert.deepStrictEqual(
      tab.history.map((entry) => entry.hash),
      ['p', 'd', 'base'],
    );
  });

  test('expands the merges hiding a commit, though a pull merge among them was collapsed by hand', () => {
    const tab = newTabState();
    loadHistory(tab, pull, { name: 'main', commit: 'p' }, []);
    toggleMerges(tab, ['p']);
    layOutHistory(tab, true, 'p');
    expandMerges(tab, mergesHidingCommit(tab, 'f'), true);
    layOutHistory(tab, true, 'p');
    assert.ok(tab.positions.has('f'));
  });

  test('expands the merges hiding a commit, leaving a merge inside them expanded', () => {
    const tab = newTabState();
    loadHistory(
      tab,
      [
        { hash: 'outer', parents: ['a', 'inner'] },
        { hash: 'a', parents: ['base'] },
        { hash: 'inner', parents: ['b', 'x'] },
        { hash: 'b', parents: ['base'] },
        { hash: 'x', parents: ['base'] },
        { hash: 'base', parents: [] },
      ],
      { name: 'main', commit: 'outer' },
      [],
    );
    toggleMerges(tab, ['outer']);
    layOutHistory(tab, false, 'outer');
    expandMerges(tab, mergesHidingCommit(tab, 'x'), false);
    layOutHistory(tab, false, 'outer');
    assert.ok(tab.positions.has('x'));
    assert.deepStrictEqual([...tab.toggledMerges], []);
  });

  test('knows whether the history is loaded, until it is forgotten', () => {
    const tab = newTabState();
    assert.strictEqual(historyLoaded(tab), false);
    loadHistory(tab, history, { name: 'main', commit: 'c' }, []);
    assert.strictEqual(historyLoaded(tab), true);
    forgetHistory(tab);
    assert.strictEqual(historyLoaded(tab), false);
  });

  test('keeps the history for refs that reach exactly its commits', () => {
    const tab = newTabState();
    const main = { name: 'main', commit: 'c' };
    assert.strictEqual(refsKeepHistory(tab, main, [], false), false);
    loadHistory(tab, history, main, [at('c')]);
    assert.strictEqual(
      refsKeepHistory(tab, main, [at('c'), at('b')], false),
      true,
    );
    assert.strictEqual(refsKeepHistory(tab, main, [], false), true);
    assert.strictEqual(refsKeepHistory(tab, main, [at('d')], false), false);
    assert.strictEqual(
      refsKeepHistory(tab, { commit: 'b' }, [at('a')], false),
      false,
    );
    assert.strictEqual(refsKeepHistory(tab, main, [at('d')], true), true);
    assert.strictEqual(
      refsKeepHistory(tab, { name: 'b', commit: 'b' }, [at('c')], true),
      false,
    );
    forgetHistory(tab);
    assert.strictEqual(refsKeepHistory(tab, main, [at('c')], false), false);
  });

  test('selects a commit at its position, dropping the selected file', () => {
    const tab = laidOut(history);
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

  test('selects a comparison at the position of the commit compared to', () => {
    const tab = laidOut(history);
    select(tab, comparisonOf('c', 'b'));
    assert.strictEqual(tab.index, 1);
    select(tab, comparisonOf('b', workingTreeHash));
    assert.strictEqual(tab.index, -1);
  });

  test('keeps a comparison while both of its commits are in the history', () => {
    const exists = stillThere(laidOut(history));
    assert.ok(exists(comparisonOf('a', 'c')));
    assert.ok(exists(comparisonOf(workingTreeHash, 'c')));
    assert.ok(!exists(comparisonOf('a', 'x')));
    assert.ok(!exists(comparisonOf('x', workingTreeHash)));
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
    select(tab, 'a');
    const message = commitsMessage(tab, firstPage(tab, false, 'b'), []);
    assert.strictEqual(message.selectedIndex, 2);
    assert.deepStrictEqual(message.scrollTarget, { index: 1 });
  });

  test('replays the commits at the selected commit and the one that keeps its place', () => {
    const tab = laidOut();
    keep(tab.shown, commitsMessage(tab, firstPage(tab, false, 'h0'), []));
    select(tab, 'h5');
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

  test('lets the keys go on from the merge that collapsing hides the selected commit in', () => {
    const tab = newTabState();
    loadHistory(tab, history, { name: 'main', commit: 'c' }, []);
    tab.hash = 'b';
    layOutHistory(tab, true, 'c');
    const message = commitsMessage(tab, firstPage(tab, false), []);
    assert.strictEqual(message.selectedIndex, undefined);
    assert.strictEqual(message.keysFrom, 0);
    const replayed = replayOf(tab).find((shown) => shown.type === 'commits');
    assert.strictEqual(replayed, undefined);
    keep(tab.shown, message);
    assert.strictEqual(
      replayOf(tab).find((shown) => shown.type === 'commits')?.keysFrom,
      0,
    );
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

  test('forgets the subjects no step back or forward needs once a thousand are kept', () => {
    const tab = newTabState();
    keepSubjects(tab, page(0, 1000));
    tab.navigation = { back: ['c1'], forward: ['c2'] };
    tab.hash = 'c3';
    keepSubjects(tab, page(1000, 1));
    assert.deepStrictEqual(
      ['c0', 'c1', 'c2', 'c3', 'c1000'].map(
        (hash) => navigationEntry(tab, hash).subject,
      ),
      [undefined, 'c1', 'c2', 'c3', 'c1000'],
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

  test('lists the 20 nearest steps in the dropdowns, nearest first', () => {
    const tab = laidOut();
    tab.hash = 'h24';
    tab.navigation = {
      back: Array.from({ length: 24 }, (_, i) => `h${i}`),
      forward: [],
    };
    assert.deepStrictEqual(
      nearestSteps(tab).back,
      Array.from({ length: 20 }, (_, i) => `h${23 - i}`),
    );
  });
});
