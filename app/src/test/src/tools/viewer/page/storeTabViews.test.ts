import * as assert from 'node:assert';
import { suite, test, vi } from 'vitest';
import { plainSearch } from '../../../../../lib/shared/searchOptions';
import { keepingWait } from '../../../../../lib/page/viewKeeper';
import { pageViews } from '../../../../../shell/page/toolViews';
import type { ToHost } from '../../../../../shell/shared/protocol';
import { createViewerStore } from '../../../../../tools/viewer/page/store';
import { choicesOf } from '../../../../../tools/viewer/page/state';
import { noKeptViewer } from '../../../../../tools/viewer/page/tabParts';
import { noop } from '../../../../helpers/fixtures';

const folder = 'C:\\code';

const file = `${folder}\\a.txt`;

const wholeWord = { ...plainSearch, wholeWord: true };

function keepingViews() {
  const kept: ToHost[] = [];
  const page = pageViews((message) => kept.push(message));
  const store = createViewerStore(noop, {}, page.views);
  page.views.onRelease(store.getState().releaseTab);
  return {
    store,
    hand: page.handed,
    release: (tab: string) => {
      page.release(tab);
      const released = kept.at(-1);
      return released?.type === 'released' ? released.view : undefined;
    },
    keptOf: (tab: string) =>
      kept.findLast(
        (message): message is Extract<ToHost, { type: 'keepView' }> =>
          message.type === 'keepView' && message.tab === tab,
      )?.view,
    keptTabs: () =>
      kept.flatMap((message) =>
        message.type === 'keepView' ? [message.tab] : [],
      ),
  };
}

suite('Viewer store keeping its tabs', () => {
  test('lets go of what it keeps of a tab released, giving its view as it is at once, as the shell hands it back should the tab come back', () => {
    const { store, release } = keepingViews();
    const { receive } = store.getState();
    receive({ type: 'show', tab: '2', file });
    store.getState().choose({ mode: 'hex' });
    store.getState().keepViewer('2', { finding: true });
    store.getState().keepPlace('2', 12);
    receive({ type: 'show', tab: '4', file });

    const released = release('2') ?? '';
    assert.ok(released.includes('"mode":"hex"'));
    assert.ok(released.includes('"place":12'));
    assert.strictEqual(release('9'), '');
    assert.deepStrictEqual([...store.getState().choices.keys()], []);
    assert.deepStrictEqual(store.getState().keptViewer('2'), noKeptViewer);
    assert.strictEqual(store.getState().placeOf('2'), 0);
  });

  test('sends what it keeps of the tab shown a while after it changes, and of a tab left at once, each only once changed', () => {
    vi.useFakeTimers();
    try {
      const { store, keptTabs } = keepingViews();
      const { receive } = store.getState();
      receive({ type: 'show', tab: '1', file });
      store.getState().keepViewer('1', { finding: true });
      assert.deepStrictEqual(keptTabs(), []);
      vi.advanceTimersByTime(keepingWait);
      assert.deepStrictEqual(keptTabs(), ['1']);
      store.getState().keepPlace('1', 4);
      receive({ type: 'show', tab: '2', file });
      assert.deepStrictEqual(keptTabs(), ['1', '1']);
      store.getState().keepViewer('2', { finding: true });
      vi.advanceTimersByTime(keepingWait);
      assert.deepStrictEqual(keptTabs(), ['1', '1', '2']);
      store.getState().keepPlace('2', 0);
      store.getState().keepTabs();
      assert.strictEqual(keptTabs().length, 4);
    } finally {
      vi.useRealTimers();
    }
  });

  test('brings a viewer tab back from what another page kept of it, its choices, place, find and focus, without what it read', () => {
    const left = keepingViews();
    const { store } = left;
    const { receive } = store.getState();
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
    receive({ type: 'hide' });
    const kept = left.keptOf('2') ?? '';

    const back = keepingViews();
    back.hand('2', kept);
    const other = back.store;
    other.getState().receive({ type: 'show', tab: '2', file });

    assert.deepStrictEqual(choicesOf(other.getState()), {
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

  test('takes what it is handed field by field, leaving out what is not what it kept', () => {
    const { store, hand } = keepingViews();
    hand(
      '2',
      JSON.stringify({
        choices: { mode: 'sideways', encoding: 'klingon', language: 'json' },
        place: -4,
        finding: 'yes',
        search: { query: 'adam', options: wholeWord },
        current: 2.5,
        sideways: { body: 'text', left: 'far', column: 0 },
      }),
    );
    store.getState().receive({ type: 'show', tab: '2', file });

    assert.deepStrictEqual(choicesOf(store.getState()), { language: 'json' });
    assert.strictEqual(store.getState().placeOf('2'), 0);
    assert.deepStrictEqual(store.getState().keptViewer('2'), {
      ...noKeptViewer,
      search: { query: 'adam', options: wholeWord },
    });
  });

  test('keeps what a viewer tab read, its text, colors, rows, bytes and matches, only for the three viewer tabs shown last, and its find, place and focus for every one', () => {
    const store = createViewerStore(noop);
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
    const pdf = `${folder}/a.pdf`;
    receive({ type: 'show', tab: '2', file: pdf });
    const pdfFind = {
      search: { query: 'adam', options: wholeWord },
      current: 3,
    };
    store.getState().keepViewer('2', { pdfFind });
    receive({ type: 'hide' });

    const back = keepingViews();
    back.hand('2', left.keptOf('2') ?? '');
    const other = back.store;
    other.getState().receive({ type: 'show', tab: '2', file: pdf });

    assert.deepStrictEqual(other.getState().keptViewer('2').pdfFind, pdfFind);
  });

  test('brings the find of a Markdown preview back from what another page kept of it, its query, toggles and the match it was on', () => {
    const left = keepingViews();
    const { store } = left;
    const { receive } = store.getState();
    const markdown = `${folder}/a.md`;
    receive({ type: 'show', tab: '2', file: markdown });
    const markdownFind = {
      search: { query: 'beta', options: wholeWord },
      current: 2,
    };
    store.getState().keepViewer('2', { markdownFind });
    receive({ type: 'hide' });

    const back = keepingViews();
    back.hand('2', left.keptOf('2') ?? '');
    const other = back.store;
    other.getState().receive({ type: 'show', tab: '2', file: markdown });

    assert.deepStrictEqual(
      other.getState().keptViewer('2').markdownFind,
      markdownFind,
    );
  });

  test('lets go of what it keeps of the tab it shows once released, as soon as it shows another, rather than keeping it as left', () => {
    const { store, release } = keepingViews();
    const { receive } = store.getState();
    receive({ type: 'show', tab: '2', file });
    store.getState().choose({ mode: 'hex' });
    store.getState().keepPlace('2', 9);

    assert.ok(release('2')?.includes('hex'));
    receive({ type: 'show', tab: '3', file });

    assert.deepStrictEqual([...store.getState().choices.keys()], []);
    assert.strictEqual(store.getState().placeOf('2'), 0);
  });

  test('starts a tab the editor turned into a viewer at the byte and in the encoding the editor gives, over what it kept of the tab before', () => {
    const { store } = keepingViews();
    const { receive } = store.getState();
    receive({ type: 'show', tab: '1', file });
    store.getState().keepPlace('1', 40);
    store.getState().choose({ encoding: 'utf-16le' });
    receive({ type: 'show', tab: '1', file, at: 12, encoding: 'windows-1250' });
    assert.deepStrictEqual(
      [store.getState().placeOf('1'), choicesOf(store.getState()).encoding],
      [12, 'windows-1250'],
    );
  });
});
