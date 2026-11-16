import * as assert from 'node:assert';
import { EditorState } from '@codemirror/state';
import { suite, test, vi } from 'vitest';
import { plainSearch } from '../../../../../lib/shared/searchOptions';
import { keepingWait } from '../../../../../lib/page/viewKeeper';
import { viewerChoices } from '../../../../../tools/commander/page/view';
import { filterOf } from '../../../../../tools/commander/page/sideFilters';
import { createCommanderStore } from '../../../../../tools/commander/page/store';
import { noKeptViewer } from '../../../../../tools/commander/page/viewerKept';
import { noKeptEditing } from '../../../../../tools/commander/page/editorKept';
import { noop } from '../../../../helpers/fixtures';
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
    receive({ type: 'show', tab: '2', file: `${folder}\\a.txt` });
    store.getState().choose({ mode: 'hex' });
    store.getState().keepViewer('2', { finding: true });
    store.getState().keepPlace('2', 12);
    receive({ type: 'show', tab: '3', file: `${folder}\\a.txt`, edit: true });
    store.getState().keepEditing('3', { finding: true });
    receive({ type: 'show', tab: '4' });

    const released = ['1', '2', '3', '9'].map(release);
    assert.deepStrictEqual(
      released.map((view) => {
        const parsed: unknown = view === '' ? view : JSON.parse(view ?? '');
        return typeof parsed === 'object' && parsed !== null
          ? Object.keys(parsed)
          : parsed;
      }),
      [['sides'], ['viewer'], ['editor'], ''],
    );
    assert.ok(released[0]?.includes('"query":"a"'));

    const { view } = store.getState();
    assert.deepStrictEqual([...view.kept.keys()], []);
    assert.deepStrictEqual([...view.viewers.keys()], []);
    assert.strictEqual(
      store.getState().scrollOf(`1 left ${folder} details`),
      0,
    );
    assert.deepStrictEqual(store.getState().keptViewer('2'), noKeptViewer);
    assert.strictEqual(store.getState().placeOf('2'), 0);
    assert.deepStrictEqual(store.getState().keptEditing('3'), noKeptEditing);
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
      receive({ type: 'show', tab: '2', file: `${folder}\\a.txt` });
      assert.deepStrictEqual(keptSent(), ['1', '1', '2']);
      store.getState().keepViewer('2', { finding: true });
      vi.advanceTimersByTime(keepingWait);
      assert.deepStrictEqual(keptSent(), ['1', '1', '2', '2']);
      store.getState().keepPlace('2', 0);
      store.getState().keepTabs();
      assert.strictEqual(keptSent().length, 5);
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

  test('brings a viewer tab back from what another page kept of it, its choices, place, find and focus, without what it read', () => {
    const left = keepingViews();
    const { store } = left;
    const { receive } = store.getState();
    const file = `${folder}\\a.txt`;
    receive({ type: 'show', tab: '2', file });
    store
      .getState()
      .choose({ mode: 'hex', encoding: 'utf-16le', language: 'json' });
    store.getState().keepPlace('2', 120);
    const sideways = { body: 'hex', left: 30, column: 0 };
    const preview = { top: 10, left: 0, block: 3, offset: 4 };
    const focus = { name: 'find', selection: [1, 3, 'forward'] } as const;
    store.getState().keepViewer('2', {
      finding: true,
      search: { query: 'adam', options: wholeWord },
      current: 3,
      focus,
      sideways,
      preview,
      bytes: { version: '1', start: 0, data: [1, 2], asked: 2 },
    });
    receive({ type: 'show', tab: '1' });
    const kept = left.keptOf('2') ?? '';

    const back = keepingViews();
    back.hand('2', kept);
    const other = back.store;
    other.getState().receive({ type: 'show', tab: '2', file });

    assert.deepStrictEqual(viewerChoices(other.getState().view), {
      mode: 'hex',
      encoding: 'utf-16le',
      language: 'json',
    });
    assert.strictEqual(other.getState().placeOf('2'), 120);
    assert.deepStrictEqual(other.getState().keptViewer('2'), {
      ...noKeptViewer,
      finding: true,
      search: { query: 'adam', options: wholeWord },
      current: 3,
      focus,
      sideways,
      preview,
    });
  });

  test('brings an editor tab back from what another page kept of it, its find and replace and focus, taking its text from the main process rather than an editor state it held', () => {
    const left = keepingViews();
    const { store } = left;
    const { receive } = store.getState();
    const file = `${folder}\\a.txt`;
    receive({ type: 'show', tab: '3', file, edit: true });
    const editing = {
      finding: true,
      replacing: true,
      query: { text: 'adam', options: wholeWord },
      replacement: 'eve',
      focus: { name: 'replace' },
      goingToLine: { value: '12', selection: [2, 2, 'none'] },
      reopening: 'utf-16le',
    } as const;
    store.getState().keepEditing('3', editing);
    receive({ type: 'show', tab: '1' });
    const kept = left.keptOf('3') ?? '';

    const back = keepingViews();
    const other = back.store;
    other.getState().editorKeeper('3')({
      state: EditorState.create({ doc: 'stale' }),
      version: 1,
    });
    back.hand('3', kept);
    other.getState().receive({ type: 'show', tab: '3', file, edit: true });

    assert.deepStrictEqual(other.getState().keptEditing('3'), editing);
    assert.strictEqual(other.getState().keptEditor('3'), undefined);
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
        viewer: 'not for a commander tab',
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

  test('keeps what a viewer tab read, its text, colors, rows, bytes and matches, only for the three viewer tabs shown last, and its find, place and focus for every one', () => {
    const store = createCommanderStore(noop);
    const { receive } = store.getState();
    const text = {
      encoding: 'utf-8',
      version: '1',
      text: { text: 'x', marked: false },
    } as const;
    for (const tab of ['1', '2', '3', '4']) {
      receive({ type: 'show', tab, file: `${folder}/${tab}.txt` });
      store.getState().keepViewer(tab, { finding: true, text });
      store.getState().keepPlace(tab, 7);
    }

    assert.strictEqual(store.getState().keptViewer('1').text, undefined);
    assert.strictEqual(store.getState().keptViewer('1').finding, true);
    assert.strictEqual(store.getState().placeOf('1'), 7);
    assert.deepStrictEqual(store.getState().keptViewer('2').text, text);
    store.getState().keepViewer('1', { text });
    assert.strictEqual(store.getState().keptViewer('1').text, undefined);
    receive({ type: 'show', tab: '1', file: `${folder}/1.txt` });
    store.getState().keepViewer('1', { text });
    assert.deepStrictEqual(store.getState().keptViewer('1').text, text);
    assert.strictEqual(store.getState().keptViewer('2').text, undefined);
  });

  test('brings the find of a PDF back from what another page kept of it, its query, toggles and the match it was on', () => {
    const left = keepingViews();
    const { store } = left;
    const { receive } = store.getState();
    const file = `${folder}/a.pdf`;
    receive({ type: 'show', tab: '2', file });
    const pdfFind = {
      search: { query: 'adam', options: wholeWord },
      current: 3,
    };
    store.getState().keepViewer('2', { pdfFind });
    receive({ type: 'show', tab: '1' });

    const back = keepingViews();
    back.hand('2', left.keptOf('2') ?? '');
    const other = back.store;
    other.getState().receive({ type: 'show', tab: '2', file });

    assert.deepStrictEqual(other.getState().keptViewer('2').pdfFind, pdfFind);
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
    receive({ type: 'show', tab: '2', file: `${folder}\\a.txt` });
    store.getState().choose({ mode: 'hex' });

    assert.ok(release('2')?.includes('hex'));
    receive({ type: 'show', tab: '1' });
    assert.ok(release('1')?.includes('0.3'));
    receive({ type: 'show', tab: '3' });

    const { view } = store.getState();
    assert.deepStrictEqual([...view.kept.keys()], []);
    assert.deepStrictEqual([...view.viewers.keys()], []);
    assert.deepStrictEqual([...store.getState().filters.keys()], []);
  });
});
