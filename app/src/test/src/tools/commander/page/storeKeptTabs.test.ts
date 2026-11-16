import * as assert from 'node:assert';
import { suite, test, vi } from 'vitest';
import { plainSearch } from '../../../../../lib/shared/searchOptions';
import { keepingWait } from '../../../../../lib/page/viewKeeper';
import { filterOf } from '../../../../../tools/commander/page/sideFilters';
import { keepingViews, withFiles } from './storeFixtures';

const folder = 'C:\\code';

const wholeWord = { ...plainSearch, wholeWord: true };

suite('Commander store keeping its tabs', () => {
  test('lets go of what it keeps of a tab released, giving its view as it is at once, as the shell hands it back should the tab come back', () => {
    const { store, release } = keepingViews();
    const { receive } = store.getState();
    receive({ type: 'show', tab: '1' });
    receive(withFiles(folder, 'a.txt'));
    store.getState().filterSide('left', 'a');
    store.getState().keepScroll(`1 left ${folder} details`, 40);
    receive({ type: 'show', tab: '4' });

    const released = ['1', '9'].map(release);
    assert.deepStrictEqual(
      released.map((view) => {
        const parsed: unknown = view === '' ? view : JSON.parse(view ?? '');
        return typeof parsed === 'object' && parsed !== null
          ? Object.keys(parsed)
          : parsed;
      }),
      [['sides'], ''],
    );
    assert.ok(released[0]?.includes('"query":"a"'));

    const { view } = store.getState();
    assert.deepStrictEqual([...view.kept.keys()], []);
    assert.strictEqual(
      store.getState().scrollOf(`1 left ${folder} details`),
      0,
    );
    receive({ type: 'show', tab: '1' });
    receive(withFiles(folder, 'a.txt'));
    assert.strictEqual(filterOf(store.getState(), 'left'), undefined);
  });

  test('sends what it keeps of the tab shown a while after it changes, and of a tab left at once, each only once changed', () => {
    vi.useFakeTimers();
    try {
      const { store, keptTabs } = keepingViews();
      const { receive } = store.getState();
      receive({ type: 'show', tab: '1' });
      receive(withFiles(folder, 'a.txt', 'b.txt'));
      const before = keptTabs().length;
      const keptSent = () => keptTabs().slice(before);

      store.getState().select('left', 'b.txt');
      assert.deepStrictEqual(keptSent(), []);
      vi.advanceTimersByTime(keepingWait);
      assert.deepStrictEqual(keptSent(), ['1']);
      vi.advanceTimersByTime(keepingWait);
      store.getState().activate('left');
      receive({ type: 'show', tab: '2' });
      assert.deepStrictEqual(keptSent(), ['1', '1', '2']);
      receive({ ...withFiles(folder, 'a.txt', 'b.txt'), tab: '2' });
      store.getState().select('left', 'b.txt');
      store.getState().keepTabs();
      assert.deepStrictEqual(keptSent(), ['1', '1', '2', '2']);
    } finally {
      vi.useRealTimers();
    }
  });

  test('brings a commander tab back from what another page kept of it, its active side, divider, focus, layouts, filters, scroll places, and the selection and marks of each side once its folder is listed', () => {
    const left = keepingViews();
    const { store } = left;
    const { receive } = store.getState();
    receive({ type: 'show', tab: '1' });
    receive(withFiles(folder, 'a.txt', 'b.txt', 'c.txt'));
    store.getState().select('left', 'b.txt');
    store.getState().mark('left', ['a.txt', 'c.txt'], true);
    store.getState().activate('left');
    store.getState().dispatch({ type: 'share', share: 0.3 });
    store.getState().dispatch({
      type: 'focus',
      focus: { name: 'filter left', selection: [1, 1, 'none'] },
    });
    store.getState().chooseLayout('right', 'thumbnails');
    store.getState().filterSide('left', 'txt', wholeWord);
    store.getState().keepScroll(`1 left ${folder} details`, 40);
    store.getState().keepScroll(`1 left ${folder}\\gone details`, 80);
    store.getState().keepTabs();
    const kept = left.keptOf('1') ?? '';

    const back = keepingViews();
    back.hand('1', kept);
    const other = back.store;
    other.getState().receive({ type: 'show', tab: '1' });
    other
      .getState()
      .receive({ ...withFiles(folder, 'a.txt', 'b.txt', 'c.txt') });

    const { view } = other.getState();
    assert.strictEqual(view.active, 'left');
    assert.strictEqual(view.share, 0.3);
    assert.deepStrictEqual(view.focus, {
      name: 'filter left',
      selection: [1, 1, 'none'],
    });
    assert.deepStrictEqual(view.layouts, {
      left: 'details',
      right: 'thumbnails',
    });
    assert.strictEqual(view.panes.left?.selected, 'b.txt');
    assert.deepStrictEqual(
      [...(view.panes.left?.marked ?? [])],
      ['a.txt', 'c.txt'],
    );
    assert.deepStrictEqual(filterOf(other.getState(), 'left'), {
      folder,
      query: 'txt',
      options: wholeWord,
    });
    assert.strictEqual(
      other.getState().scrollOf(`1 left ${folder} details`),
      40,
    );
    assert.strictEqual(
      other.getState().scrollOf(`1 left ${folder}\\gone details`),
      0,
    );
  });

  test('takes what it is handed field by field, leaving out what is not what it kept', () => {
    const { store, hand } = keepingViews();
    hand(
      '1',
      JSON.stringify({
        sides: {
          active: 'up',
          share: 7,
          focus: { name: 3 },
          layouts: { left: 'thumbnails', right: 'tiles' },
          panes: { left: { folder: 1 }, right: { folder, marked: [1, 'b'] } },
          filters: {
            left: { query: 'a', options: { caseSensitive: 'yes' } },
            right: { folder, query: 'b', options: plainSearch },
          },
          scrolls: [
            [`left ${folder} details`, -1],
            'x',
            [`right ${folder} details`, 5],
          ],
        },
        editor: 'not for a commander tab',
      }),
    );
    store.getState().receive({ type: 'show', tab: '1' });
    store.getState().receive({ ...withFiles(folder, 'a', 'b'), side: 'right' });

    const { view } = store.getState();
    assert.strictEqual(view.active, 'right');
    assert.strictEqual(view.share, 0.5);
    assert.strictEqual(view.focus, undefined);
    assert.deepStrictEqual(view.layouts, {
      left: 'thumbnails',
      right: 'details',
    });
    assert.deepStrictEqual([...(view.panes.right?.marked ?? [])], ['b']);
    assert.strictEqual(filterOf(store.getState(), 'right')?.query, 'b');
    assert.strictEqual(
      store.getState().scrollOf(`1 left ${folder} details`),
      0,
    );
    assert.strictEqual(
      store.getState().scrollOf(`1 right ${folder} details`),
      5,
    );
  });

  test('keeps the marks of a side whole or not at all, none once they are too many to keep', () => {
    const left = keepingViews();
    const { store } = left;
    const { receive } = store.getState();
    const names = Array.from({ length: 6000 }, (_, index) => `${index}.txt`);
    receive({ type: 'show', tab: '1' });
    receive(withFiles(folder, ...names));
    store.getState().mark('left', names, true);
    store.getState().keepTabs();

    const back = keepingViews();
    back.hand('1', left.keptOf('1') ?? '');
    const other = back.store;
    other.getState().receive({ type: 'show', tab: '1' });
    other.getState().receive(withFiles(folder, ...names));
    assert.strictEqual(other.getState().view.panes.left?.marked.size, 0);
  });

  test('lets go of what it keeps of the tab it shows once released, as soon as it shows another, rather than keeping it as left', () => {
    const { store, release } = keepingViews();
    const { receive } = store.getState();
    receive({ type: 'show', tab: '1' });
    receive(withFiles(folder, 'a.txt'));
    store.getState().dispatch({ type: 'share', share: 0.3 });
    store.getState().filterSide('left', 'a');

    assert.ok(release('1')?.includes('0.3'));
    receive({ type: 'show', tab: '3' });

    const { view } = store.getState();
    assert.deepStrictEqual([...view.kept.keys()], []);
    assert.deepStrictEqual([...store.getState().filters.keys()], []);
  });
});
