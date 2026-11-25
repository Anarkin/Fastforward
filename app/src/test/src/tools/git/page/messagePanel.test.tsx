import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { type PeekAnchor } from '../../../../../tools/git/page/messageHolding';
import {
  MessageBody,
  MessageCorner,
  MessagePanel,
} from '../../../../../tools/git/page/messagePanel';
import { classesOf, tagsWith } from '../../../../helpers/markup';

const metric = (value: (element: Element) => number) => ({
  configurable: true,
  get(this: Element) {
    return value(this);
  },
});

const anchor: PeekAnchor = {
  left: 40,
  top: 100,
  width: 200,
  room: { top: 50, bottom: 450 },
};

suite('Message peek', () => {
  test("lays the row out over its own row, indented so its subject starts where the row's does, knowing how wide the row is, and no taller than the list", () => {
    const html = renderToStaticMarkup(
      <MessagePanel anchor={anchor} indent={8}>
        <div className="extended">Row</div>
      </MessagePanel>,
    );
    const [panel] = tagsWith(html, 'message-peek');
    assert.match(
      panel,
      /style="left:32px;top:100px;max-height:400px;--peek-row-width:200px"/,
    );
    assert.match(panel, /role="tooltip"/);
    assert.match(html, /<div class="extended">Row<\/div>/);
  });

  test('hints at pinning a message peeked at with the pin and the keys that pin it, and closes a pinned one with a button in their place, holding both either way so pinning keeps the width', () => {
    const peeked = renderToStaticMarkup(<MessageCorner />);
    const pinned = renderToStaticMarkup(<MessageCorner onUnpin={() => 0} />);
    for (const html of [peeked, pinned]) {
      assert.strictEqual(tagsWith(html, 'message-hint').length, 1);
      assert.match(
        html,
        /<kbd>Alt<\/kbd><span class="shortcut-joiner">\+<\/span><kbd class="pointer"><svg class="icon mouse-icon"[^>]*>.*?<\/svg>Click<\/kbd>/,
      );
      assert.strictEqual(tagsWith(html, 'message-close').length, 1);
    }
    assert.deepStrictEqual(
      [...classesOf(tagsWith(peeked, 'message-corner')[0] ?? '')],
      ['message-corner'],
    );
    assert.match(tagsWith(peeked, 'message-close')[0] ?? '', /disabled/);
    assert.strictEqual(tagsWith(pinned, 'message-corner', 'pinned').length, 1);
    const [close] = tagsWith(pinned, 'message-close');
    assert.doesNotMatch(close ?? '', /disabled/);
    assert.match(close ?? '', /aria-label="Close"/);
    assert.doesNotMatch(close ?? '', /data-tip=/);
  });

  test('names the keys that pin from the keyboard on a message peeked at from the keyboard, as the click is not at hand there', () => {
    for (const html of [
      renderToStaticMarkup(<MessageCorner byKeys />),
      renderToStaticMarkup(<MessageCorner byKeys onUnpin={() => 0} />),
    ]) {
      assert.match(
        html,
        /<kbd>Alt<\/kbd><span class="shortcut-joiner">\+<\/span><kbd>Enter<\/kbd>/,
      );
      assert.doesNotMatch(html, /Click/);
    }
  });

  test('tells how many lines of the rest of a message are cut off under it, as a cut through a blank line shows nothing of them, but not of one scrolling them, as a pinned one does', async () => {
    const dom = new JSDOM('<!doctype html><main></main>');
    const globals = {
      window: dom.window,
      document: dom.window.document,
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    const saved = Object.fromEntries(
      Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
    );
    Object.assign(globalThis, globals);
    const { HTMLElement } = dom.window;
    Object.defineProperties(HTMLElement.prototype, {
      scrollHeight: metric((element) =>
        element.classList.contains('message-body') ? 250 : 0,
      ),
      clientHeight: metric((element) =>
        element.classList.contains('message-body') ? 50 : 0,
      ),
    });
    let overflowY = 'hidden';
    dom.window.getComputedStyle = () =>
      Object.assign(Object.create(null), { lineHeight: '20px', overflowY });
    try {
      const { createRoot } = await import('react-dom/client');
      const main = dom.window.document.querySelector('main');
      assert.ok(main);
      const root = createRoot(main);
      await act(async () => {
        root.render(<MessageBody key="cut" text={'One\n\nThree\nFour'} />);
      });
      assert.strictEqual(
        main.querySelector('.message-more')?.textContent,
        '10 more lines',
      );
      overflowY = 'auto';
      await act(async () => {
        root.render(<MessageBody key="pinned" text={'One\n\nThree\nFour'} />);
      });
      assert.strictEqual(main.querySelector('.message-more'), null);
      await act(async () => {
        root.unmount();
      });
    } finally {
      Object.assign(globalThis, saved);
    }
  });

  test('writes the rest of a message as it is, able to take the keyboard to scroll it, and nothing for a message that has none', () => {
    assert.strictEqual(
      renderToStaticMarkup(<MessageBody text={'Body\n  more'} />),
      '<div class="message-body" tabindex="-1">Body\n  more</div>',
    );
    assert.strictEqual(renderToStaticMarkup(<MessageBody text="" />), '');
  });
});
