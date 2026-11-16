import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { createDiffStore } from '../../../../../tools/diff/page/store';
import type {
  CompareView,
  DiffToHost,
} from '../../../../../tools/diff/shared/protocol';
import { plainSearch } from '../../../../../lib/shared/searchOptions';
import { noop } from '../../../../helpers/fixtures';

const settings = {
  showEntireFile: false,
  ignoreWhitespace: true,
  diffLayout: 'sideBySide',
} as const;

const compare = (tab: string, version = 1): CompareView => ({
  tab,
  old: '/a.txt',
  new: '/b.txt',
  name: 'b.txt',
  patch: '',
  version,
  entire: false,
});

const loaded = (tab: string, path: string) =>
  ({
    type: 'texts',
    tab,
    texts: [{ path, side: 'new', blob: 'b', text: 'text' }],
  }) as const;

suite('Diff store', () => {
  test('keeps the comparison of the tab shown and the texts loaded for it, while the files compared change, starting anew for another tab, and lets go of them once the tab hides', () => {
    const store = createDiffStore(noop);
    const state = () => store.getState();
    state().receive({ type: 'show', tab: 'c1', settings });
    state().receive({ type: 'compare', compare: compare('c1') });
    state().receive(loaded('c1', 'a.txt'));
    state().receive(loaded('c1', 'b.txt'));
    state().receive({ type: 'compare', compare: compare('c1', 2) });
    assert.deepStrictEqual(
      [state().compare?.version, state().texts.size],
      [2, 2],
    );

    state().receive({ type: 'show', tab: 'c2', settings });
    assert.deepStrictEqual(
      [state().compare, state().texts.size],
      [undefined, 0],
    );
    state().receive(loaded('c1', 'a.txt'));
    state().receive({ type: 'compare', compare: compare('c1') });
    assert.deepStrictEqual(
      [state().compare, state().texts.size],
      [undefined, 0],
    );
    state().receive(loaded('c2', 'a.txt'));
    assert.strictEqual(state().texts.size, 1);

    state().receive({ type: 'hide' });
    assert.deepStrictEqual(
      [state().tab, state().compare, state().texts.size],
      [undefined, undefined, 0],
    );
  });

  test('takes the settings of the diff as a tab shows, changes them at once, and tells the main process, asking it for texts too', () => {
    const posted: DiffToHost[] = [];
    const store = createDiffStore((message) => posted.push(message));
    const state = () => store.getState();
    state().receive({ type: 'show', tab: 'c1', settings });
    state().setShowEntireFile(true);
    state().setIgnoreWhitespace(false);
    state().setDiffLayout('inline');
    state().loadTexts([{ path: 'a.txt', side: 'old', blob: 'a' }]);
    assert.deepStrictEqual(state().settings, {
      showEntireFile: true,
      ignoreWhitespace: false,
      diffLayout: 'inline',
    });
    assert.deepStrictEqual(posted, [
      { type: 'setShowEntireFile', show: true },
      { type: 'setIgnoreWhitespace', ignore: false },
      { type: 'setDiffLayout', layout: 'inline' },
      {
        type: 'loadTexts',
        requests: [{ path: 'a.txt', side: 'old', blob: 'a' }],
      },
    ]);
  });

  test('keeps the find of each tab, closing it with its query cleared and its options kept', () => {
    const store = createDiffStore(noop);
    const state = () => store.getState();
    const regex = { ...plainSearch, regex: true };
    state().keepFind('c1', {
      finding: true,
      search: { query: 'adam', options: regex },
    });
    assert.strictEqual(state().finds.get('c2'), undefined);
    state().closeFind('c1');
    assert.deepStrictEqual(state().finds.get('c1'), {
      finding: false,
      search: { query: '', options: regex },
    });
  });
});
