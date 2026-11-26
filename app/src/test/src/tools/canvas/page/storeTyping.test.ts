import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { pageViews } from '../../../../../shell/page/toolViews';
import type { ToHost } from '../../../../../shell/shared/protocol';
import { createCanvasStore } from '../../../../../tools/canvas/page/store';
import type { Board } from '../../../../../tools/canvas/shared/board';
import type { CanvasToHost } from '../../../../../tools/canvas/shared/protocol';

const board = (text: string, more: Board['nodes'] = []): Board => ({
  nodes: [
    { id: 'note', type: 'text', text, x: 0, y: 0, width: 70, height: 54 },
    ...more,
  ],
  edges: [],
});

const shown = (tab: string, text: string, made?: string) =>
  ({
    type: 'board',
    tab,
    file: '/boards/plan.canvas',
    board: board(text, [
      {
        id: 'made',
        type: 'text',
        text: '',
        x: 0,
        y: 90,
        width: 70,
        height: 54,
      },
    ]),
    ...(made === undefined ? {} : { made }),
  }) as const;

function opened(showing = true) {
  const posted: CanvasToHost[] = [];
  const kept: ToHost[] = [];
  const page = pageViews((message) => kept.push(message));
  const store = createCanvasStore(
    (message) => posted.push(message),
    {},
    page.views,
  );
  page.views.onRelease(store.getState().releaseTab);
  if (showing) {
    store
      .getState()
      .receive({ type: 'show', tab: '7', file: '/boards/plan.canvas' });
  }
  return { store, posted, kept, page };
}

suite('Canvas store typing', () => {
  test('types into a text node where asked, selecting it, and posts a change of its text under the number of the typing, but no move of the caret', () => {
    const { store, posted } = opened();
    store.getState().receive(shown('7', 'Plan'));
    store.getState().startTyping('7', 'note', { anchor: 2, head: 2 });
    const typing = store.getState().typingOf('7');
    assert.deepStrictEqual(
      typing && { text: typing.text, anchor: typing.anchor, head: typing.head },
      { text: 'Plan', anchor: 2, head: 2 },
    );
    assert.deepStrictEqual(store.getState().selectedOf('7'), ['note']);
    store.getState().typed('7', { text: 'Plan', anchor: 0, head: 4 });
    assert.deepStrictEqual(posted, []);
    store.getState().typed('7', { text: 'PlXan', anchor: 3, head: 3 });
    assert.deepStrictEqual(posted, [
      {
        type: 'edit',
        tab: '7',
        edit: {
          kind: 'text',
          id: 'note',
          text: 'PlXan',
          session: typing?.session,
        },
      },
    ]);
  });

  test('keeps the text typed while the boards of the changes posted come back behind it, types into a text node once made, and stops once its node is gone', () => {
    const { store } = opened();
    store.getState().receive(shown('7', 'Plan'));
    store.getState().startTyping('7', 'note');
    store.getState().typed('7', { text: 'Plans', anchor: 5, head: 5 });
    store.getState().receive(shown('7', 'Plan'));
    assert.strictEqual(store.getState().typingOf('7')?.text, 'Plans');
    store.getState().receive(shown('7', 'Plans', 'made'));
    assert.strictEqual(store.getState().typingOf('7')?.id, 'made');
    store.getState().receive({
      type: 'board',
      tab: '7',
      file: '/boards/plan.canvas',
      board: board('Plans'),
    });
    assert.strictEqual(store.getState().typingOf('7'), undefined);
  });

  test('brings typing back where it was in a tab moved to another window, once its board comes', () => {
    const left = opened();
    left.store.getState().receive(shown('7', 'Plan'));
    left.store.getState().startTyping('7', 'note', { anchor: 1, head: 1 });
    left.store
      .getState()
      .receive({ type: 'show', tab: '8', file: '/b.canvas' });
    left.page.release('7');
    const released = left.kept.at(-1);
    assert.ok(released?.type === 'released');

    const right = opened(false);
    right.page.handed('7', released.view);
    right.store
      .getState()
      .receive({ type: 'show', tab: '7', file: '/boards/plan.canvas' });
    assert.strictEqual(right.store.getState().typingOf('7'), undefined);
    right.store.getState().receive(shown('7', 'Plan'));
    const back = right.store.getState().typingOf('7');
    assert.deepStrictEqual(
      back && { id: back.id, text: back.text, head: back.head },
      { id: 'note', text: 'Plan', head: 1 },
    );
  });
});
