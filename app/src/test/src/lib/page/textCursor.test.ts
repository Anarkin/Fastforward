import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test } from 'vitest';
import {
  fieldCell,
  headOf,
  isTextField,
  shownText,
} from '../../../../lib/page/textCursor';

function withPage(run: (document: Document) => void): void {
  const dom = new JSDOM('<!doctype html><main></main>');
  const saved = Reflect.get(globalThis, 'HTMLInputElement');
  Object.assign(globalThis, { HTMLInputElement: dom.window.HTMLInputElement });
  try {
    run(dom.window.document);
  } finally {
    Object.assign(globalThis, { HTMLInputElement: saved });
  }
}

suite('Text cursor', () => {
  test('draws the cursor of a box one types text in, a password too, but not of a box one cannot type in, an email box, which keeps no selection to place it by, a checkbox or what is no box', () => {
    withPage((document) => {
      const field = (attributes: string) => {
        const holder = document.createElement('div');
        holder.innerHTML = `<input ${attributes}>`;
        return holder.firstElementChild;
      };
      for (const typed of [
        '',
        'type="text"',
        'type="search"',
        'type="password"',
        'type="url"',
        'type="tel"',
      ]) {
        assert.ok(isTextField(field(typed)), typed);
      }
      for (const untyped of [
        'type="email"',
        'type="checkbox"',
        'type="radio"',
        'readonly',
        'disabled',
      ]) {
        assert.ok(!isTextField(field(untyped)), untyped);
      }
      assert.ok(!isTextField(document.createElement('textarea')));
      assert.ok(!isTextField(null));
    });
  });

  test('measures a password by the bullets Chromium shows for its characters', () => {
    assert.strictEqual(shownText({ type: 'password', value: 'abc' }), '•••');
    assert.strictEqual(shownText({ type: 'text', value: 'abc' }), 'abc');
  });

  test('draws the cursor at the end of a selection one extends, the start of one extended backward', () => {
    assert.strictEqual(
      headOf({
        selectionStart: 2,
        selectionEnd: 5,
        selectionDirection: 'forward',
      }),
      5,
    );
    assert.strictEqual(
      headOf({
        selectionStart: 2,
        selectionEnd: 5,
        selectionDirection: 'backward',
      }),
      2,
    );
    assert.strictEqual(
      headOf({
        selectionStart: null,
        selectionEnd: null,
        selectionDirection: null,
      }),
      0,
    );
  });

  test('puts the cell of the cursor after the text before it, less what the box scrolled, on the line Chromium centers in the box, as wide as the character under it or a digit past the end', () => {
    const metrics = {
      content: { left: 10, top: 20, width: 200, height: 26 },
      lineHeight: 18,
      scrolled: 5,
      before: 21.6,
      emptyCell: 7.2,
    };
    assert.deepStrictEqual(fieldCell({ ...metrics, through: 28.8 }), {
      left: 10 + 21.6 - 5,
      top: 24,
      width: 28.8 - 21.6,
      height: 18,
    });
    assert.deepStrictEqual(fieldCell({ ...metrics, through: undefined }), {
      left: 10 + 21.6 - 5,
      top: 24,
      width: 7.2,
      height: 18,
    });
  });
});
