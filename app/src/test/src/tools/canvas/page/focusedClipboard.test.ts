import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test } from 'vitest';
import { watchClipboard } from '../../../../../tools/canvas/page/focusedClipboard';

function page() {
  const { window } = new JSDOM(
    `<!doctype html><main>
      <div id="board" tabindex="0"><span id="cursor"></span></div>
      <input id="field">
    </main>`,
  );
  const board = window.document.querySelector<HTMLElement>('#board');
  const cursor = window.document.querySelector<HTMLElement>('#cursor');
  const field = window.document.querySelector<HTMLElement>('#field');
  assert.ok(board && cursor && field);
  const heard: string[] = [];
  const stop = watchClipboard(board, (event) => heard.push(event.type));
  const fired = (at: HTMLElement, kind: string) =>
    at.dispatchEvent(new window.Event(kind, { bubbles: true }));
  return {
    body: window.document.body,
    board,
    cursor,
    field,
    heard,
    fired,
    stop,
  };
}

suite('The clipboard of the element with the focus', () => {
  test('hears a copy, a cut and a paste the browser fires at the body, where it fires those of an element that takes text while the page has no caret in it, as a node of a canvas typed in pasted nothing until its window lost the focus and had it again', () => {
    const { body, board, heard, fired } = page();
    board.focus();
    for (const kind of ['copy', 'cut', 'paste']) {
      fired(body, kind);
    }

    assert.deepStrictEqual(heard, ['copy', 'cut', 'paste']);
  });

  test('hears one the browser fires inside the element once, where it fires them once the page has a caret there', () => {
    const { board, cursor, heard, fired } = page();
    board.focus();
    fired(cursor, 'paste');
    fired(board, 'copy');

    assert.deepStrictEqual(heard, ['paste', 'copy']);
  });

  test('hears none while another element has the focus, nor once it watches no longer', () => {
    const { body, board, field, heard, fired, stop } = page();
    fired(body, 'paste');
    field.focus();
    fired(field, 'paste');
    fired(body, 'copy');
    board.focus();
    stop();
    fired(body, 'paste');

    assert.deepStrictEqual(heard, []);
  });
});
