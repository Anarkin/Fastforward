import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act, useRef } from 'react';
import { suite, test } from 'vitest';
import {
  focusBack,
  focusOf,
  useFocusKeeper,
  type KeptFocus,
} from '../../../../lib/page/keptFocus';
import { mounted } from '../../../helpers/mounted';

const page = () =>
  new JSDOM(
    `<!doctype html><main>
      <section id="tool">
        <div data-focus-name="body" tabindex="0"><span id="inside">text</span></div>
        <input data-focus-name="find" value="needle in a haystack">
        <button id="unnamed">Aa</button>
      </section>
      <input id="outside" data-focus-name="find">
    </main>`,
  ).window.document;

const named = (document: Document, name: string) =>
  document.querySelector<HTMLInputElement>(`#tool [data-focus-name="${name}"]`);

suite('The focus kept for a tab', () => {
  test('names the part of a tool that has the focus, with the caret and the selection of a box, and nothing for a part without a name or outside the tool', () => {
    const document = page();
    const tool = document.querySelector('#tool');
    assert.ok(tool);
    const find = named(document, 'find');
    find?.focus();
    find?.setSelectionRange(3, 9, 'backward');
    assert.deepStrictEqual(focusOf(tool, document.activeElement), {
      name: 'find',
      selection: [3, 9, 'backward'],
    });
    named(document, 'body')?.focus();
    assert.deepStrictEqual(focusOf(tool, document.activeElement), {
      name: 'body',
    });
    assert.deepStrictEqual(focusOf(tool, document.querySelector('#inside')), {
      name: 'body',
    });
    document.querySelector<HTMLElement>('#unnamed')?.focus();
    assert.strictEqual(focusOf(tool, document.activeElement), undefined);
    document.querySelector<HTMLElement>('#outside')?.focus();
    assert.strictEqual(focusOf(tool, document.activeElement), undefined);
  });

  test('gives the focus back to the part named, putting back the caret and the selection of a box, and says when the part is not there', () => {
    const document = page();
    const tool = document.querySelector('#tool');
    assert.ok(tool);
    assert.ok(focusBack(tool, { name: 'find', selection: [3, 9, 'backward'] }));
    const find = named(document, 'find');
    assert.strictEqual(document.activeElement, find);
    assert.deepStrictEqual(
      [find?.selectionStart, find?.selectionEnd, find?.selectionDirection],
      [3, 9, 'backward'],
    );
    assert.ok(focusBack(tool, { name: 'body' }));
    assert.strictEqual(document.activeElement, named(document, 'body'));
    assert.ok(!focusBack(tool, { name: 'replace' }));
    assert.ok(!focusBack(tool, undefined));
    assert.strictEqual(document.activeElement, named(document, 'body'));
  });

  test('keeps the part that takes the focus and the caret as it moves in a box, as the keys and the pointer move it', async () => {
    const kept: (KeptFocus | undefined)[] = [];
    function Tool() {
      const root = useRef<HTMLElement>(null);
      useFocusKeeper(root, (focus) => kept.push(focus));
      return (
        <section ref={root}>
          <div data-focus-name="body" tabIndex={0} />
          <input data-focus-name="find" defaultValue="needle" />
          <button>Aa</button>
        </section>
      );
    }
    await mounted(<Tool />, (main, window) => {
      const find = main.querySelector('input');
      const body = main.querySelector<HTMLElement>('[data-focus-name="body"]');
      act(() => find?.focus());
      act(() => {
        find?.setSelectionRange(2, 4);
        find?.dispatchEvent(
          new window.KeyboardEvent('keyup', { bubbles: true }),
        );
      });
      act(() => {
        find?.setSelectionRange(6, 6);
        find?.dispatchEvent(
          new window.MouseEvent('mouseup', { bubbles: true }),
        );
      });
      act(() => body?.focus());
      act(() => main.querySelector('button')?.focus());
    });
    assert.strictEqual(kept[0]?.name, 'find');
    assert.deepStrictEqual(kept.slice(1), [
      { name: 'find', selection: [2, 4, 'none'] },
      { name: 'find', selection: [6, 6, 'none'] },
      { name: 'body' },
      undefined,
    ]);
  });
});
