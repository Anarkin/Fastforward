import * as assert from 'node:assert';
import { afterEach, beforeEach, suite, test, vi } from 'vitest';
import { keepingWait, ViewKeeper } from '../../../../lib/page/viewKeeper';

function keeping(shown: string | undefined = '1') {
  const handed = new Map<string, string>();
  const sent: string[] = [];
  const views = new Map<string, string>();
  const state = { shown };
  const keeper = new ViewKeeper(
    {
      of: (tab) => handed.get(tab),
      keep: (tab, view) => {
        handed.set(tab, view);
        sent.push(`${tab} ${view}`);
      },
    },
    (tab) => views.get(tab),
    () => state.shown,
  );
  return { keeper, handed, sent, views, state };
}

suite('View keeper', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('sends the view of the tab shown a while after it changes, that of a tab not shown at once, and the same view never twice', () => {
    const { keeper, sent, views } = keeping();
    views.set('1', 'a');
    keeper.changed('1');
    vi.advanceTimersByTime(keepingWait - 1);
    assert.deepStrictEqual(sent, []);
    vi.advanceTimersByTime(1);
    assert.deepStrictEqual(sent, ['1 a']);

    keeper.changed('1');
    vi.advanceTimersByTime(keepingWait);
    views.set('2', 'b');
    keeper.changed('2');
    vi.advanceTimersByTime(0);
    assert.deepStrictEqual(sent, ['1 a', '2 b']);
  });

  test('sends the view of a tab left at once, and every view due once flushed, as the page goes away', () => {
    const { keeper, sent, views } = keeping();
    views.set('1', 'a');
    views.set('3', 'c');
    keeper.changed('1');
    keeper.left('1');
    assert.deepStrictEqual(sent, ['1 a']);
    views.set('1', 'b');
    keeper.changed('1');
    keeper.changed('3');
    keeper.flush();
    assert.deepStrictEqual(sent, ['1 a', '1 b', '3 c']);
    vi.advanceTimersByTime(keepingWait);
    assert.strictEqual(sent.length, 3);
  });

  test('takes the view handed to the page of a tab once, and none it sent itself, so a tool restores only what another page left', () => {
    const { keeper, handed, sent, views } = keeping();
    handed.set('1', 'from another page');
    assert.strictEqual(keeper.handed('1'), 'from another page');
    assert.strictEqual(keeper.handed('1'), undefined);
    views.set('2', 'mine');
    keeper.changed('2');
    keeper.flush();
    assert.strictEqual(keeper.handed('2'), undefined);
    views.set('1', 'from another page');
    keeper.changed('1');
    keeper.flush();
    assert.deepStrictEqual(sent, ['2 mine']);
  });

  test('gives the view of a tab released as it is at once, and lets go of the tab, sending nothing more of it', () => {
    const { keeper, sent, views } = keeping();
    views.set('1', 'a');
    keeper.changed('1');
    assert.strictEqual(keeper.release('1'), 'a');
    vi.advanceTimersByTime(keepingWait);
    assert.deepStrictEqual(sent, []);
    assert.strictEqual(keeper.release('2'), undefined);
  });
});
