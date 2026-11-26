import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { pageViews } from '../../../../../shell/page/toolViews';
import type { ToHost } from '../../../../../shell/shared/protocol';
import { createCanvasStore } from '../../../../../tools/canvas/page/store';

function keepingViews() {
  const kept: ToHost[] = [];
  const page = pageViews((message) => kept.push(message));
  const store = createCanvasStore({}, page.views);
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

const show = (tab: string) =>
  ({ type: 'show', tab, file: `/boards/${tab}.canvas` }) as const;

suite('Canvas store keeping its tabs', () => {
  test('brings a canvas tab back where it was moved to, and lets go of it once released', () => {
    const left = keepingViews();
    left.store.getState().receive(show('7'));
    left.store.getState().pan('7', { column: -12, row: 4 });
    left.store.getState().receive(show('8'));
    const sent = left.release('7') ?? '';
    assert.strictEqual(left.store.getState().originOf('7'), undefined);

    const back = keepingViews();
    back.hand('7', sent);
    back.store.getState().receive(show('7'));
    assert.deepStrictEqual(back.store.getState().originOf('7'), {
      column: -12,
      row: 4,
    });
  });

  test('brings a canvas tab back on whole cells though it was kept between them, as a canvas rests on whole cells alone', () => {
    const back = keepingViews();
    back.hand('7', JSON.stringify({ origin: { column: 88.6, row: -3.2 } }));
    back.store.getState().receive(show('7'));
    assert.deepStrictEqual(back.store.getState().originOf('7'), {
      column: 89,
      row: -3,
    });
  });
});
