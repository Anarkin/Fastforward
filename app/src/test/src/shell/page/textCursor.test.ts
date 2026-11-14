import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test } from 'vitest';
import {
  fieldCell,
  fieldSelection,
  headOf,
  installTextCursors,
  isTextField,
  shownText,
} from '../../../../shell/page/textCursor';

interface Controlled {
  readonly field: HTMLInputElement;
  readonly frames: () => Promise<void>;
  readonly blur: () => void;
}

const box = (left: number, right: number, top: number, bottom: number) => ({
  left,
  right,
  top,
  bottom,
  width: right - left,
  height: bottom - top,
});

async function controlled(
  variables: string,
  run: (page: Controlled) => Promise<void>,
): Promise<void> {
  const dom = new JSDOM(
    `<!doctype html><html><head><style>:root { ${variables} } input { line-height: 18px }</style></head><body><input type="text" value="xx yy"></body></html>`,
    { pretendToBeVisual: true },
  );
  const { window } = dom;
  let focused = true;
  Object.assign(window.document, { hasFocus: () => focused });
  Object.assign(window, {
    matchMedia: () => ({
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
  Object.assign(window.Range.prototype, {
    getBoundingClientRect(this: Range) {
      return box(this.startOffset * 7, this.endOffset * 7, 0, 18);
    },
    getClientRects(this: Range) {
      return [box(this.startOffset * 7, this.endOffset * 7, 0, 18)];
    },
  });
  const field = window.document.querySelector('input');
  assert.ok(field !== null);
  Object.assign(field, { getBoundingClientRect: () => box(40, 340, 400, 428) });
  const globals = {
    window,
    document: window.document,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    devicePixelRatio: 1,
    HTMLInputElement: window.HTMLInputElement,
    MutationObserver: window.MutationObserver,
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
  };
  const saved = Object.fromEntries(
    Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
  );
  Object.assign(globalThis, globals);
  const stop = installTextCursors();
  try {
    field.focus();
    field.setSelectionRange(0, 2);
    await run({
      field,
      frames: async () => {
        for (let frame = 0; frame < 3; frame++) {
          await new Promise((resolve) => window.requestAnimationFrame(resolve));
        }
      },
      blur: () => {
        focused = false;
        window.dispatchEvent(new window.Event('blur'));
      },
    });
  } finally {
    stop();
    Object.assign(globalThis, saved);
  }
}

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

  test('selects text over the row the cursor fills, from the left of the first character to the right of the last, within the box as it scrolls, and draws nothing for no text', () => {
    const line = {
      content: { left: 50, top: 400, width: 100, height: 24 },
      lineHeight: 18,
      scrolled: 0,
    };
    assert.deepStrictEqual(fieldSelection(line, 7.5, 37.5), {
      left: 57.5,
      top: 403,
      width: 30,
      height: 18,
    });
    assert.deepStrictEqual(
      fieldSelection({ ...line, scrolled: 20 }, 7.5, 200),
      { left: 50, top: 403, width: 100, height: 18 },
    );
    assert.strictEqual(fieldSelection(line, 7.5, 7.5), undefined);
    assert.strictEqual(
      fieldSelection({ ...line, scrolled: 300 }, 7.5, 37.5),
      undefined,
    );
  });

  for (const style of ['block', 'bar', 'underline', 'outline']) {
    test(`draws the cursor of a text box in a window without the focus as it does with it, as a ${style}, blinking as it does and keeping its selection, as the editor and the terminal do`, async () => {
      await controlled(
        `--cursor-style: ${style}; --cursor-width: 3; --cursor-blink: on;`,
        async ({ field, frames, blur }) => {
          const drawnOf = () => {
            const cursor = field.ownerDocument.querySelector('.text-cursor');
            assert.ok(
              cursor instanceof field.ownerDocument.defaultView!.HTMLElement,
            );
            const { width, height, top, borderWidth, background, animation } =
              cursor.style;
            return {
              shape: { width, height, top, borderWidth, background },
              blinking: animation !== 'none' && animation !== '',
              selection: field.style.backgroundSize,
            };
          };
          await frames();
          const focusedLook = drawnOf();
          blur();
          await frames();
          const blurredLook = drawnOf();
          assert.ok(focusedLook.selection !== '', 'the selection drawn');
          assert.ok(focusedLook.blinking, 'the cursor blinking');
          assert.deepStrictEqual(blurredLook, focusedLook);
        },
      );
    });
  }

  test('keeps the native selection of a text box hidden behind the one it draws when the page rewrites the class of the box, as React does for a class it owns', async () => {
    await controlled('', async ({ field, frames }) => {
      await frames();
      field.className = 'locations-search active';
      await frames();
      assert.ok(field.matches('[data-text-cursor]'));
    });
  });
});
