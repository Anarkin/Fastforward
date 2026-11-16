import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { plainSearch } from '../../../../../lib/shared/searchOptions';
import { pageViews } from '../../../../../shell/page/toolViews';
import type { ToHost } from '../../../../../shell/shared/protocol';
import { createDiffStore } from '../../../../../tools/diff/page/store';
import type { DiffState } from '../../../../../tools/diff/page/diffState';
import { noop } from '../../../../helpers/fixtures';

const settings = {
  showEntireFile: false,
  ignoreWhitespace: true,
  diffLayout: 'sideBySide',
} as const;

function keepingViews() {
  const kept: ToHost[] = [];
  const page = pageViews((message) => kept.push(message));
  const store = createDiffStore(noop, {}, page.views);
  page.views.onRelease(store.getState().releaseTab);
  return {
    store,
    hand: page.handed,
    release: (tab: string) => {
      page.release(tab);
      const released = kept.at(-1);
      return released?.type === 'released' ? released.view : undefined;
    },
  };
}

const looksOf = (state: DiffState, tab: string) => [
  state.finds.get(tab),
  state.focusOf(tab),
  state.placeOf(tab),
  state.languages.get(tab),
];

suite('Diff store keeping its tabs', () => {
  test('brings a tab back from the view handed to the page, its find, focus, place and language, and lets go of all of it once released', () => {
    const left = keepingViews();
    const state = () => left.store.getState();
    state().receive({ type: 'show', tab: '7', settings });
    state().keepFind('7', {
      finding: true,
      search: { query: 'eve', options: plainSearch },
    });
    state().keepFocus('7', { name: 'diff' });
    state().keepPlace('7', { top: 30, current: 1 });
    state().pickLanguage('7', 'rust');
    const looked = looksOf(state(), '7');
    state().receive({ type: 'show', tab: '8', settings });
    const sent = left.release('7') ?? '';
    assert.deepStrictEqual(looksOf(state(), '7'), [
      undefined,
      undefined,
      undefined,
      undefined,
    ]);

    const back = keepingViews();
    back.hand('7', sent);
    back.store.getState().receive({ type: 'show', tab: '7', settings });
    assert.deepStrictEqual(looksOf(back.store.getState(), '7'), looked);
  });
});
