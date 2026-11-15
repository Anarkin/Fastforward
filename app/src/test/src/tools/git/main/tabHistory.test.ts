import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { newTabState } from '../../../../../tools/git/main/tabState';
import {
  forgetHistory,
  historyLoaded,
  loadHistory,
  refsKeepHistory,
  tipsInGitOrder,
} from '../../../../../tools/git/main/tabHistory';
import { Commits } from '../../../../../tools/git/main/commits';
import { at, history } from './tabStateFixtures';

suite('Tab history', () => {
  test('knows whether the history is loaded, until it is forgotten', () => {
    const tab = newTabState();
    assert.strictEqual(historyLoaded(tab), false);
    loadHistory(tab, Commits.of(history), { name: 'main', commit: 'c' }, []);
    assert.strictEqual(historyLoaded(tab), true);
    forgetHistory(tab);
    assert.strictEqual(historyLoaded(tab), false);
  });

  test('keeps the history for refs that reach exactly its commits', () => {
    const tab = newTabState();
    const main = { name: 'main', commit: 'c' };
    assert.strictEqual(refsKeepHistory(tab, main, [], false), false);
    loadHistory(tab, Commits.of(history), main, [at('c')]);
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

  test('keeps the history only while its stashes stay, unless solo leaves them out', () => {
    const tab = newTabState();
    const main = { name: 'main', commit: 'c' };
    const stash = {
      name: 'stash@{0}',
      commit: 's',
      message: 'On main: kept',
      untracked: undefined,
    };
    loadHistory(
      tab,
      Commits.of([{ hash: 's', parents: ['c'] }, ...history]),
      main,
      [at('c')],
      [stash],
    );
    assert.strictEqual(
      refsKeepHistory(tab, main, [at('c')], false, [stash]),
      true,
    );
    assert.strictEqual(refsKeepHistory(tab, main, [at('c')], false), false);
    loadHistory(tab, Commits.of(history), main, [at('c')]);
    assert.strictEqual(
      refsKeepHistory(tab, main, [at('c')], false, [stash]),
      false,
    );
    assert.strictEqual(
      refsKeepHistory(tab, main, [at('c')], true, [stash]),
      true,
    );
  });

  test('keeps no history in which a commit read as a stash is one no more, or one read whole is one now, as a stash is read with its first parent alone', () => {
    const tab = newTabState();
    const main = { name: 'main', commit: 'c' };
    const stash = {
      name: 'stash@{0}',
      commit: 's',
      message: 'On main: kept',
      untracked: undefined,
    };
    loadHistory(
      tab,
      Commits.of([{ hash: 's', parents: ['c'] }, ...history]),
      main,
      [at('c')],
      [stash],
    );
    assert.strictEqual(
      refsKeepHistory(tab, main, [at('c'), at('s')], false, [stash]),
      true,
    );
    assert.strictEqual(
      refsKeepHistory(tab, main, [at('c'), at('s')], false),
      false,
    );
    loadHistory(
      tab,
      Commits.of([{ hash: 's', parents: ['c', 'i'] }, ...history]),
      main,
      [at('c'), at('s')],
    );
    assert.strictEqual(
      refsKeepHistory(tab, main, [at('c'), at('s')], false),
      true,
    );
    assert.strictEqual(
      refsKeepHistory(tab, main, [at('c'), at('s')], false, [stash]),
      false,
    );
  });

  test('keeps the history only while git takes its tips of the same time in the order it has them, as HEAD moving or a ref renamed can swap them', () => {
    const tied = [
      { hash: 'a', parents: ['x'] },
      { hash: 'c', parents: ['x'] },
      { hash: 'x', parents: [] },
    ];
    const main = { name: 'main', commit: 'a' };
    const aaa = { name: 'aaa', commit: 'c' };
    const refs = [at('c'), { ...at('a'), name: 'main' }];
    const sameTime = new Map([
      ['c', 10],
      ['a', 10],
    ]);
    const tab = newTabState();
    loadHistory(tab, Commits.of(tied), main, refs, [], sameTime);
    assert.strictEqual(
      refsKeepHistory(tab, main, refs, false, [], sameTime),
      true,
    );
    assert.strictEqual(
      refsKeepHistory(tab, aaa, refs, false, [], sameTime),
      false,
    );
    assert.strictEqual(refsKeepHistory(tab, aaa, refs, false), false);
    assert.strictEqual(
      refsKeepHistory(
        tab,
        aaa,
        refs,
        false,
        [],
        new Map([
          ['c', 10],
          ['a', 20],
        ]),
      ),
      true,
    );
    const detached = { commit: 'x' };
    const [a, c, x] = tied;
    loadHistory(tab, Commits.of([c, a, x]), detached, refs, [], sameTime);
    const renamed = [
      { ...at('a'), name: 'main' },
      { ...at('c'), name: 'zzz' },
    ];
    assert.strictEqual(
      refsKeepHistory(
        tab,
        detached,
        renamed,
        false,
        [],
        new Map([
          ['a', 10],
          ['c', 10],
        ]),
      ),
      false,
    );
  });

  test('lists its tips in the order git takes them: HEAD, the refs as for-each-ref lists them, a remote HEAD in its own place though refs leave it out, then the stashes', () => {
    const head = { name: 'main', commit: 'h' };
    const refs = [
      { kind: 'remote' as const, name: 'origin/aaa', commit: 'a' },
      { kind: 'remote' as const, name: 'origin/main', commit: 'm' },
    ];
    const dates = new Map([
      ['m', 1],
      ['a', 1],
    ]);
    const stashes = [
      {
        name: 'stash@{0}',
        commit: 's',
        message: 'On main: kept',
        untracked: undefined,
      },
    ];
    assert.deepStrictEqual(
      [...tipsInGitOrder(head, refs, false, stashes, dates)],
      ['h', 'm', 'a', 's'],
    );
    assert.deepStrictEqual(
      [...tipsInGitOrder(head, refs, true, stashes, dates)],
      ['h'],
    );
  });

  test("takes no remote's tag as a tip, as its commit may be missing here and git keeps no ref for it", () => {
    const refs = [
      { kind: 'tag' as const, name: 'v1', commit: 't' },
      {
        kind: 'remote-tag' as const,
        name: 'origin/v2',
        commit: 'r',
        remote: 'origin',
      },
    ];
    assert.deepStrictEqual(
      [...tipsInGitOrder({ name: 'main', commit: 'h' }, refs, false)],
      ['h', 't'],
    );
  });
});
