import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { pageViews } from '../../../../../shell/page/toolViews';
import type { ToHost } from '../../../../../shell/shared/protocol';
import { createCanvasStore } from '../../../../../tools/canvas/page/store';
import type { CanvasToHost } from '../../../../../tools/canvas/shared/protocol';

function keepingViews() {
  const kept: ToHost[] = [];
  const posted: CanvasToHost[] = [];
  const page = pageViews((message) => kept.push(message));
  const store = createCanvasStore(
    (message) => posted.push(message),
    {},
    page.views,
  );
  page.views.onRelease(store.getState().releaseTab);
  return {
    store,
    posted,
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

  test('brings back the color a canvas tab was asking for, with what was typed into it, once the tab is moved, and colors what it was asked for once answered', () => {
    const left = keepingViews();
    left.store.getState().receive(show('7'));
    left.store.getState().askColor('7', { nodes: ['a'], edges: ['e'] });
    left.store.getState().keepColorTyped('7', { value: '#12' });
    left.store.getState().receive(show('8'));
    const sent = left.release('7') ?? '';

    const back = keepingViews();
    back.hand('7', sent);
    back.store.getState().receive(show('7'));
    assert.deepStrictEqual(back.store.getState().colorings.get('7'), {
      nodes: ['a'],
      edges: ['e'],
      typed: { value: '#12' },
    });
    back.store.getState().answerColor('7', '#123456');
    assert.deepStrictEqual(back.posted.at(-1), {
      type: 'edit',
      tab: '7',
      edit: { kind: 'color', nodes: ['a'], edges: ['e'], color: '#123456' },
    });
    assert.strictEqual(back.store.getState().colorings.get('7'), undefined);
    back.store.getState().askColor('7', { nodes: ['a'], edges: [] });
    const posts = back.posted.length;
    back.store.getState().answerColor('7', undefined);
    assert.strictEqual(back.posted.length, posts);
    assert.strictEqual(back.store.getState().colorings.get('7'), undefined);
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
