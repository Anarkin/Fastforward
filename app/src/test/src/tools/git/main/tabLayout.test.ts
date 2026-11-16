import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { comparisonOf } from '../../../../../lib/shared/comparisons';
import {
  commitPageSize,
  workingTreeHash,
} from '../../../../../tools/git/shared/protocol';
import { newTabState, select } from '../../../../../tools/git/main/tabState';
import {
  historyLoaded,
  loadHistory,
} from '../../../../../tools/git/main/tabHistory';
import {
  commitsMessage,
  expandMerges,
  firstPage,
  layOutHistory,
  mergesHidingCommit,
  toggleMerges,
} from '../../../../../tools/git/main/tabLayout';
import { keep, replayOf } from '../../../../../tools/git/main/tabReplay';
import { Commits } from '../../../../../tools/git/main/commits';
import { rowsOf } from './historyFixtures';
import { at, history, laidOut, long, page } from './tabStateFixtures';

suite('Tab layout', () => {
  const inSecondPage = commitPageSize + commitPageSize / 2;
  const inThirdPage = 2 * commitPageSize + commitPageSize / 5;

  test('lays out only the first 25 rows of a history still loading, as the whole history lays them out', () => {
    const head = { commit: 'h40' };
    const layOut = (entries: typeof long, partial: boolean) => {
      const tab = newTabState();
      loadHistory(tab, Commits.of(entries), head, [], [], new Map(), partial);
      assert.strictEqual(historyLoaded(tab), !partial);
      layOutHistory(tab, false, head.commit);
      return commitsMessage(tab, firstPage(tab, false), page(0, 25));
    };
    const first = layOut(long.slice(0, 30), true);
    const whole = layOut(long, false);
    assert.strictEqual(first.total, 25);
    assert.strictEqual(whole.total, long.length);
    assert.deepStrictEqual(first.graph, whole.graph);
    assert.deepStrictEqual(first.workingTreeGraph, whole.workingTreeGraph);
  });

  test('lays out the history with merges collapsed, keeping the selection', () => {
    const tab = newTabState();
    loadHistory(tab, Commits.of(history), { name: 'main', commit: 'c' }, []);
    tab.hash = 'a';
    const generation = layOutHistory(tab, true, 'c');
    assert.deepStrictEqual(
      rowsOf(tab.history).map((entry) => entry.hash),
      ['c', 'a'],
    );
    assert.strictEqual(tab.index, 1);
    assert.strictEqual(layOutHistory(tab, false, 'c'), generation + 1);
    assert.strictEqual(tab.index, 2);
  });

  test('keeps a merged branch in its collapsed merge though a ref points at it, unless HEAD is there', () => {
    const tab = newTabState();
    loadHistory(tab, Commits.of(history), { name: 'main', commit: 'c' }, [
      { kind: 'branch', name: 'feature', commit: 'b' },
    ]);
    layOutHistory(tab, true, 'c');
    assert.deepStrictEqual(
      rowsOf(tab.history).map((entry) => entry.hash),
      ['c', 'a'],
    );
    layOutHistory(tab, true, 'b');
    assert.deepStrictEqual(
      rowsOf(tab.history).map((entry) => entry.hash),
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

  test('lays out the history without decoding the hash of each merge, as that took a quarter of laying out the 1.5 million commits of Linux', () => {
    const merges = 20;
    const entries = Array.from({ length: merges }, (_, i) => [
      { hash: `m${i}`, parents: [`m${i + 1}`, `s${i}`] },
      { hash: `s${i}`, parents: [`m${i + 1}`] },
    ]).flat();
    const tab = newTabState();
    loadHistory(
      tab,
      Commits.of([...entries, { hash: `m${merges}`, parents: [] }]),
      { name: 'main', commit: 'm0' },
      [],
    );
    toggleMerges(tab, ['m3']);
    const decode = Buffer.prototype.toString;
    let decoded = 0;
    Buffer.prototype.toString = function (
      this: Buffer,
      ...args: Parameters<typeof decode>
    ) {
      decoded++;
      return decode.apply(this, args);
    };
    try {
      layOutHistory(tab, true, 'm0');
    } finally {
      Buffer.prototype.toString = decode;
    }
    assert.strictEqual(decoded, 0);
    assert.deepStrictEqual(
      rowsOf(tab.history)
        .map((entry) => entry.hash)
        .filter((hash) => hash.startsWith('s')),
      ['s3'],
    );
  });

  test('expands a pull merge while merges are collapsed, as collapsing it would hide the merges that landed on the mainline, until it is toggled', () => {
    const tab = newTabState();
    loadHistory(tab, Commits.of(pull), { name: 'main', commit: 'p' }, []);
    layOutHistory(tab, true, 'p');
    assert.deepStrictEqual(
      rowsOf(tab.history).map((entry) => entry.hash),
      ['p', 'd', 'm', 'base'],
    );
    toggleMerges(tab, ['p']);
    layOutHistory(tab, true, 'p');
    assert.deepStrictEqual(
      rowsOf(tab.history).map((entry) => entry.hash),
      ['p', 'd', 'base'],
    );
  });

  test('expands the merges hiding a commit, though a pull merge among them was collapsed by hand', () => {
    const tab = newTabState();
    loadHistory(tab, Commits.of(pull), { name: 'main', commit: 'p' }, []);
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
      Commits.of([
        { hash: 'outer', parents: ['a', 'inner'] },
        { hash: 'a', parents: ['base'] },
        { hash: 'inner', parents: ['b', 'x'] },
        { hash: 'b', parents: ['base'] },
        { hash: 'x', parents: ['base'] },
        { hash: 'base', parents: [] },
      ]),
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

  test('draws its stashes like the working tree', () => {
    const tab = newTabState();
    loadHistory(
      tab,
      Commits.of([{ hash: 's', parents: ['c'] }, ...history]),
      { name: 'main', commit: 'c' },
      [at('c')],
      [
        {
          name: 'stash@{0}',
          commit: 's',
          message: 'On main: kept',
          untracked: undefined,
        },
      ],
    );
    layOutHistory(tab, false, 'c');
    assert.deepStrictEqual(
      tab.graph.rows(0, 2).map((row) => row.stash ?? false),
      [true, false],
    );
  });

  test('starts the first page at the page of the commit that keeps its place', () => {
    const tab = laidOut();
    tab.anchor = { hash: `h${inSecondPage}`, offset: 3, report: 4 };
    assert.deepStrictEqual(firstPage(tab, true), {
      start: commitPageSize,
      scrollTarget: { index: inSecondPage, offset: 3, report: 4 },
    });
    assert.deepStrictEqual(firstPage(tab, false), {
      start: 0,
      scrollTarget: undefined,
    });
    tab.anchor = { hash: workingTreeHash, offset: 7, report: 5 };
    assert.deepStrictEqual(firstPage(tab, true), {
      start: 0,
      scrollTarget: { index: -1, offset: 7, report: 5 },
    });
    tab.anchor = { hash: 'gone', offset: 0, report: 6 };
    assert.deepStrictEqual(firstPage(tab, true), {
      start: 0,
      scrollTarget: undefined,
    });
  });

  test('starts the first page at the page of the commit to scroll to, or else of the selected one', () => {
    const tab = laidOut();
    assert.deepStrictEqual(firstPage(tab, false, `h${inSecondPage}`), {
      start: commitPageSize,
      scrollTarget: { index: inSecondPage },
    });
    tab.hash = `h${inThirdPage}`;
    layOutHistory(tab, false, undefined);
    assert.deepStrictEqual(firstPage(tab, false), {
      start: 2 * commitPageSize,
      scrollTarget: { index: inThirdPage },
    });
  });

  test('sends the selected commit apart from the one to scroll to', () => {
    const tab = laidOut(history);
    select(tab, 'a');
    const message = commitsMessage(tab, firstPage(tab, false, 'b'), []);
    assert.strictEqual(message.selectedIndex, 2);
    assert.deepStrictEqual(message.scrollTarget, { index: 1 });
  });

  test('keeps the working tree selected at index -1 when the history is laid out again', () => {
    const tab = newTabState();
    loadHistory(tab, Commits.of(history), { name: 'main', commit: 'c' }, []);
    tab.hash = workingTreeHash;
    layOutHistory(tab, true, 'c');
    assert.strictEqual(tab.index, -1);
  });

  test('lets the keys go on from the merge that collapsing hides the selected commit in', () => {
    const tab = newTabState();
    loadHistory(tab, Commits.of(history), { name: 'main', commit: 'c' }, []);
    tab.hash = 'b';
    layOutHistory(tab, true, 'c');
    assert.strictEqual(tab.index, undefined);
    const message = commitsMessage(tab, firstPage(tab, false), []);
    assert.strictEqual(message.selectedIndex, undefined);
    assert.strictEqual(message.keysFrom, 0);
    keep(tab.shown, message);
    assert.strictEqual(
      replayOf(tab).find((shown) => shown.type === 'commits')?.keysFrom,
      0,
    );
  });

  test('lets the keys go on from the merge that collapsing hides the commit compared to in', () => {
    const tab = newTabState();
    loadHistory(tab, Commits.of(pull), { name: 'main', commit: 'p' }, []);
    layOutHistory(tab, false, 'p');
    select(tab, comparisonOf('base', 'f'));
    toggleMerges(tab, ['p']);
    layOutHistory(tab, false, 'p');
    const message = commitsMessage(tab, firstPage(tab, false), []);
    assert.strictEqual(message.selectedIndex, undefined);
    assert.strictEqual(message.keysFrom, 0);
  });
});
