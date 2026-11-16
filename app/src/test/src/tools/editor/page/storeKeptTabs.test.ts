import * as assert from 'node:assert';
import { EditorState } from '@codemirror/state';
import { suite, test, vi } from 'vitest';
import { plainSearch } from '../../../../../lib/shared/searchOptions';
import { keepingWait } from '../../../../../lib/page/viewKeeper';
import { pageViews } from '../../../../../shell/page/toolViews';
import type { ToHost } from '../../../../../shell/shared/protocol';
import { createEditorStore } from '../../../../../tools/editor/page/store';
import { noKeptEditing } from '../../../../../tools/editor/page/editorKept';
import { noop } from '../../../../helpers/fixtures';

const wholeWord = { ...plainSearch, wholeWord: true };

const file = 'C:\\code\\a.txt';

function keepingViews() {
  const kept: ToHost[] = [];
  const page = pageViews((message) => kept.push(message));
  const store = createEditorStore(noop, {}, page.views);
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

suite('Editor store keeping its tabs', () => {
  test('lets go of what it keeps of a tab released, giving its view as it is at once, and of the tab it shows as soon as it shows another', () => {
    const { store, release } = keepingViews();
    const { receive } = store.getState();
    receive({ type: 'show', tab: '3', file });
    store.getState().keepEditing('3', { finding: true });
    store.getState().chooseLanguage('json');
    receive({ type: 'show', tab: '4', file });
    assert.ok(release('3')?.includes('"finding":true'));
    assert.deepStrictEqual(store.getState().keptEditing('3'), noKeptEditing);

    store.getState().keepEditing('4', { replacing: true });
    assert.ok(release('4')?.includes('"replacing":true'));
    receive({ type: 'show', tab: '5', file });
    assert.deepStrictEqual(store.getState().keptEditing('4'), noKeptEditing);
    assert.deepStrictEqual([...store.getState().languages.keys()], []);
  });

  test('sends what it keeps of the tab shown a while after it changes, and of a tab left at once, each only once changed', () => {
    vi.useFakeTimers();
    try {
      const { store, keptTabs } = keepingViews();
      const { receive } = store.getState();
      receive({ type: 'show', tab: '2', file });
      store.getState().keepEditing('2', { finding: true });
      assert.deepStrictEqual(keptTabs(), []);
      vi.advanceTimersByTime(keepingWait);
      assert.deepStrictEqual(keptTabs(), ['2']);
      store.getState().keepEditing('2', { replacing: true });
      receive({ type: 'show', tab: '3', file });
      assert.deepStrictEqual(keptTabs(), ['2', '2']);
      store.getState().keepEditing('3', { finding: true });
      store.getState().keepTabs();
      assert.deepStrictEqual(keptTabs(), ['2', '2', '3']);
    } finally {
      vi.useRealTimers();
    }
  });

  test('brings an editor tab back from what another page kept of it, its find and replace and focus, taking its text from the main process rather than an editor state it held', () => {
    const left = keepingViews();
    const { store } = left;
    const { receive } = store.getState();
    receive({ type: 'show', tab: '3', file });
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
    receive({ type: 'hide' });
    const kept = left.keptOf('3') ?? '';

    const back = keepingViews();
    const other = back.store;
    other.getState().editorKeeper('3')({
      state: EditorState.create({ doc: 'stale' }),
      version: 1,
    });
    back.hand('3', kept);
    other.getState().receive({ type: 'show', tab: '3', file });

    assert.deepStrictEqual(other.getState().keptEditing('3'), editing);
    assert.strictEqual(other.getState().keptEditor('3'), undefined);
  });
});
