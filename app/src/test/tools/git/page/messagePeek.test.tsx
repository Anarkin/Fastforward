import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act, useRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import type { CommitInfo } from '../../../../tools/git/shared/protocol';
import {
  hiddenLines,
  holdingAfterKey,
  holdingAfterPointer,
  liftOf,
  MessageBody,
  MessageCorner,
  MessagePanel,
  MessagePeek,
  type PeekAnchor,
} from '../../../../tools/git/page/messagePeek';
import {
  classesOf,
  commitInfo,
  keyPress,
  noModifiers,
  tagsWith,
} from '../../../fixtures';

const alt = { ...noModifiers, altKey: true };
const altDown = keyPress('Alt', { altKey: true });
const altUp = keyPress('Alt');

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

async function inList(
  commits: readonly (CommitInfo | undefined)[],
  check: (page: {
    readonly panel: () => Element | null;
    readonly key: (
      type: 'keydown' | 'keyup',
      key: string,
      altKey: boolean,
      repeat?: boolean,
    ) => Promise<void>;
    readonly point: (row: number, altKey: boolean) => Promise<void>;
    readonly leave: () => Promise<void>;
    readonly blur: () => Promise<void>;
    readonly panels: () => Element[];
    readonly pinned: () => Element | null;
    readonly click: (row: number, altKey: boolean) => Promise<void>;
    readonly pressOn: (target: Element) => Promise<void>;
    readonly scroll: () => Promise<void>;
    readonly clicked: readonly string[];
    readonly list: Element;
    readonly select: (row: number) => void;
    readonly type: (key: string, altKey: boolean) => Promise<void>;
  }) => Promise<void>,
): Promise<void> {
  const dom = new JSDOM('<!doctype html><main></main>');
  const globals = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const saved = Object.fromEntries(
    Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
  );
  Object.assign(globalThis, globals);
  try {
    const { createRoot } = await import('react-dom/client');
    const { document } = dom.window;
    const clicked: string[] = [];
    function List() {
      const list = useRef<HTMLDivElement>(null);
      return (
        <>
          <div
            ref={list}
            className="list"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                event.preventDefault();
              }
            }}
          >
            {commits.map((commit, index) => (
              <div
                key={index}
                id={`row-${index}`}
                className="virtual-row"
                data-index={index}
              >
                <div
                  className={index === 0 ? 'commit working-tree' : 'commit'}
                  onClick={() => clicked.push(commit?.hash ?? '')}
                >
                  <div className="commit-line">
                    <span className="subject">{commit?.subject}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <MessagePeek
            list={list}
            commitAt={(index) => commits[index]}
            indent={8}
            renderRow={(commit, corner) => (
              <>
                {corner}
                {commit.subject}
                <MessageBody text={commit.body} />
              </>
            )}
          />
        </>
      );
    }
    const main = document.querySelector('main');
    assert.ok(main);
    const root = createRoot(main);
    await act(async () => {
      root.render(<List />);
    });
    const list = document.querySelector('.list');
    assert.ok(list);
    const subjects = [...document.querySelectorAll('.subject')];
    let pointed = 0;
    document.elementFromPoint = () => subjects[pointed] ?? null;
    await check({
      panel: () => document.querySelector('.message-peek'),
      key: (type, key, altKey, repeat = false) =>
        act(async () => {
          dom.window.dispatchEvent(
            new dom.window.KeyboardEvent(type, { key, altKey, repeat }),
          );
        }),
      point: (row, altKey) =>
        act(async () => {
          pointed = row;
          list.dispatchEvent(
            new dom.window.MouseEvent('pointermove', { altKey }),
          );
        }),
      leave: () =>
        act(async () => {
          list.dispatchEvent(new dom.window.MouseEvent('pointerleave'));
        }),
      blur: () =>
        act(async () => {
          dom.window.dispatchEvent(new dom.window.Event('blur'));
        }),
      panels: () => [...document.querySelectorAll('.message-peek')],
      pinned: () => document.querySelector('.message-peek.pinned'),
      click: (row, altKey) =>
        act(async () => {
          subjects[row]?.dispatchEvent(
            new dom.window.MouseEvent('click', { altKey, bubbles: true }),
          );
        }),
      pressOn: (target) =>
        act(async () => {
          target.dispatchEvent(
            new dom.window.MouseEvent('pointerdown', { bubbles: true }),
          );
        }),
      scroll: () =>
        act(async () => {
          list.dispatchEvent(new dom.window.Event('scroll'));
        }),
      clicked,
      list,
      select: (row) => list.setAttribute('aria-activedescendant', `row-${row}`),
      type: (key, altKey) =>
        act(async () => {
          (document.activeElement ?? document.body).dispatchEvent(
            new dom.window.KeyboardEvent('keydown', {
              key,
              altKey,
              bubbles: true,
              cancelable: true,
            }),
          );
        }),
    });
    await act(async () => {
      root.unmount();
    });
  } finally {
    Object.assign(globalThis, saved);
  }
}

suite('Message peek', () => {
  test('holds the message open while Alt alone is held, from its key or as the pointer moves with it, and lets it go with Alt', () => {
    assert.strictEqual(holdingAfterKey('none', altDown, true), 'held');
    assert.strictEqual(holdingAfterKey('held', altDown, true), 'held');
    assert.strictEqual(holdingAfterPointer('none', alt), 'held');
    assert.strictEqual(holdingAfterKey('held', altUp, false), 'none');
    assert.strictEqual(holdingAfterPointer('held', noModifiers), 'none');
  });

  test('gives the message up for the rest of the hold once another key is pressed with Alt, such as F for the main menu, until Alt is let go', () => {
    const f = keyPress('f', { altKey: true });
    assert.strictEqual(holdingAfterKey('held', f, true), 'spoiled');
    assert.strictEqual(holdingAfterKey('spoiled', f, false), 'spoiled');
    assert.strictEqual(holdingAfterKey('spoiled', altDown, true), 'spoiled');
    assert.strictEqual(holdingAfterPointer('spoiled', alt), 'spoiled');
    assert.strictEqual(holdingAfterKey('spoiled', altUp, false), 'none');
    assert.strictEqual(holdingAfterKey('none', altDown, true), 'held');
  });

  test('keeps the hold while Alt+↑ or Alt+↓ steps through the commits, held down too', () => {
    for (const key of ['ArrowUp', 'ArrowDown']) {
      assert.strictEqual(
        holdingAfterKey('held', keyPress(key, { altKey: true }), true),
        'held',
        key,
      );
    }
    assert.strictEqual(
      holdingAfterKey(
        'held',
        keyPress('ArrowDown', { altKey: true, repeat: true }),
        true,
      ),
      'held',
    );
    assert.strictEqual(
      holdingAfterKey('held', keyPress('ArrowLeft', { altKey: true }), true),
      'spoiled',
    );
  });

  test('drops the hold while Ctrl, Shift or Cmd is held with Alt, and takes it up again once that is let go', () => {
    const shift = { altKey: true, shiftKey: true };
    assert.strictEqual(
      holdingAfterKey('held', keyPress('Shift', shift), true),
      'none',
    );
    assert.strictEqual(
      holdingAfterPointer('held', { ...alt, ctrlKey: true }),
      'none',
    );
    assert.strictEqual(
      holdingAfterKey('none', keyPress('Shift', { altKey: true }), false),
      'held',
    );
  });

  test('lifts the panel only as far as it runs past the bottom of the list, never above its top', () => {
    const room = { top: 50, bottom: 400 };
    assert.strictEqual(liftOf({ top: 100, bottom: 300 }, room), 0);
    assert.strictEqual(liftOf({ top: 300, bottom: 500 }, room), 100);
    assert.strictEqual(liftOf({ top: 100, bottom: 700 }, room), 50);
    assert.strictEqual(liftOf({ top: 40, bottom: 300 }, room), 0);
  });

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
      assert.match(html, /<kbd>Alt<\/kbd>\+<kbd>Click<\/kbd>/);
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
    assert.match(close ?? '', /title="Close"/);
  });

  test('names the keys that pin from the keyboard on a message peeked at from the keyboard, as the click is not at hand there', () => {
    for (const html of [
      renderToStaticMarkup(<MessageCorner byKeys />),
      renderToStaticMarkup(<MessageCorner byKeys onUnpin={() => 0} />),
    ]) {
      assert.match(html, /<kbd>Alt<\/kbd>\+<kbd>Enter<\/kbd>/);
      assert.doesNotMatch(html, /Click/);
    }
  });

  test('counts the lines cut off the rest of a message, a line cut through the middle among them, allowing a pixel of rounding', () => {
    assert.strictEqual(hiddenLines(250, 50, 20), 10);
    assert.strictEqual(hiddenLines(60, 50, 20), 1);
    assert.strictEqual(hiddenLines(51, 50, 20), 0);
    assert.strictEqual(hiddenLines(50, 50, 20), 0);
    assert.strictEqual(hiddenLines(250, 50, Number.NaN), 0);
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

  test('shows the message of the commit under the pointer while Alt alone is held, even one its row shows whole, so holding Alt always answers, but not of the working tree, and hides it once Alt is let go, another key is pressed, the pointer leaves or the window loses focus', async () => {
    const commits = [
      commitInfo('w', { body: 'Working tree' }),
      commitInfo('a', { subject: 'First', body: 'More of the first' }),
      commitInfo('b', { subject: 'Second', body: 'More of the second' }),
      commitInfo('c', { subject: 'Third' }),
    ];
    await inList(commits, async ({ panel, key, point, leave, blur }) => {
      await point(1, false);
      assert.strictEqual(panel(), null);
      await key('keydown', 'Alt', true);
      assert.match(panel()?.textContent ?? '', /More of the first/);
      await point(2, true);
      assert.match(panel()?.textContent ?? '', /More of the second/);
      await point(3, true);
      assert.match(panel()?.textContent ?? '', /Third/);
      await point(0, true);
      assert.strictEqual(panel(), null);
      await point(2, true);
      await key('keydown', 'f', true);
      assert.strictEqual(panel(), null);
      await key('keyup', 'Alt', false);
      await key('keydown', 'Alt', true);
      assert.match(panel()?.textContent ?? '', /More of the second/);
      await key('keyup', 'Alt', false);
      assert.strictEqual(panel(), null);
      await key('keydown', 'Alt', true);
      await blur();
      assert.strictEqual(panel(), null);
      await point(1, true);
      assert.ok(panel());
      await leave();
      assert.strictEqual(panel(), null);
    });
  });

  test('pins the message of a commit clicked with Alt, without selecting it, one at a time, keeping it once Alt is let go while still peeking at others, until Escape, a click on it with Alt, a press outside it, a scroll of the list or the window losing focus', async () => {
    const commits = [
      commitInfo('w', { body: 'Working tree' }),
      commitInfo('a', { subject: 'First', body: 'More of the first' }),
      commitInfo('b', { subject: 'Second', body: 'More of the second' }),
      commitInfo('c', { subject: 'Third' }),
    ];
    await inList(
      commits,
      async ({
        panels,
        pinned,
        key,
        point,
        click,
        pressOn,
        scroll,
        blur,
        clicked,
      }) => {
        await key('keydown', 'Alt', true);
        await point(2, true);
        await click(2, true);
        assert.match(pinned()?.textContent ?? '', /More of the second/);
        assert.strictEqual(panels().length, 1);
        assert.deepStrictEqual(clicked, []);
        await key('keyup', 'Alt', false);
        assert.ok(pinned());
        await key('keydown', 'Alt', true);
        await point(1, true);
        assert.strictEqual(panels().length, 2);
        await click(1, true);
        assert.match(pinned()?.textContent ?? '', /More of the first/);
        assert.strictEqual(panels().length, 1);
        await key('keyup', 'Alt', false);
        const panel = pinned();
        assert.ok(panel);
        await pressOn(panel);
        assert.ok(pinned());
        await key('keydown', 'Escape', false);
        assert.deepStrictEqual(panels(), []);
        await click(2, true);
        const inside = pinned()?.querySelector('.message-body');
        assert.ok(inside);
        for (const altKey of [false, true]) {
          await pressOn(inside);
          await act(async () => {
            inside.dispatchEvent(
              new window.MouseEvent('click', { altKey, bubbles: true }),
            );
          });
          assert.strictEqual(
            pinned()?.textContent === undefined,
            altKey,
            `altKey: ${altKey}`,
          );
        }
        assert.deepStrictEqual(clicked, []);
        await click(2, true);
        const close = pinned()?.querySelector('.message-close');
        assert.ok(close);
        await pressOn(close);
        await act(async () => {
          close.dispatchEvent(
            new window.MouseEvent('click', { bubbles: true }),
          );
        });
        assert.strictEqual(pinned(), null);
        await click(2, true);
        await pressOn(document.body);
        assert.strictEqual(pinned(), null);
        await click(2, true);
        await scroll();
        assert.strictEqual(pinned(), null);
        await click(2, true);
        await blur();
        assert.strictEqual(pinned(), null);
        await click(3, true);
        assert.match(pinned()?.textContent ?? '', /Third/);
        await key('keydown', 'Escape', false);
        await click(0, true);
        assert.strictEqual(pinned(), null);
        await click(1, false);
        assert.strictEqual(pinned(), null);
        assert.deepStrictEqual(clicked, ['w', 'a']);
      },
    );
  });

  test('pins the message of the selected commit on Alt+Enter in the focused list, even one its row shows whole, handing its rest the keyboard so it scrolls, and closes it on Alt+Enter again or Escape, handing the keyboard back, but pins nothing for the working tree, nor while another column has the keyboard', async () => {
    const commits = [
      commitInfo('w', { body: 'Working tree' }),
      commitInfo('a', { subject: 'First', body: 'More of the first' }),
      commitInfo('b', { subject: 'Second', body: 'More of the second' }),
      commitInfo('c', { subject: 'Third' }),
    ];
    await inList(commits, async ({ pinned, list, select, type }) => {
      assert.ok('focus' in list && typeof list.focus === 'function');
      list.focus();
      select(2);
      await type('Enter', true);
      assert.match(pinned()?.textContent ?? '', /More of the second/);
      assert.strictEqual(
        document.activeElement,
        pinned()?.querySelector('.message-body'),
      );
      await type('Escape', false);
      assert.strictEqual(pinned(), null);
      assert.strictEqual(document.activeElement, list);
      await type('Enter', true);
      assert.ok(pinned());
      await type('Enter', true);
      assert.strictEqual(pinned(), null);
      assert.strictEqual(document.activeElement, list);
      select(3);
      await type('Enter', true);
      assert.match(pinned()?.textContent ?? '', /Third/);
      assert.strictEqual(document.activeElement, pinned());
      await type('Escape', false);
      select(0);
      await type('Enter', true);
      assert.strictEqual(pinned(), null);
      assert.strictEqual(document.activeElement, list);
      select(2);
      assert.ok('blur' in list && typeof list.blur === 'function');
      list.blur();
      await type('Enter', true);
      assert.strictEqual(pinned()?.textContent, undefined);
    });
  });

  test('shows the message of the selected commit while Alt is held in the focused list, following it as Alt+↑ and Alt+↓ step through the commits, and that of the commit under the pointer once the pointer moves, whichever came last', async () => {
    const commits = [
      commitInfo('w', { body: 'Working tree' }),
      commitInfo('a', { subject: 'First', body: 'More of the first' }),
      commitInfo('b', { subject: 'Second', body: 'More of the second' }),
    ];
    await inList(commits, async ({ panel, list, select, type, point, key }) => {
      select(2);
      await type('Alt', true);
      assert.strictEqual(panel(), null);
      await key('keyup', 'Alt', false);
      assert.ok('focus' in list && typeof list.focus === 'function');
      list.focus();
      await type('Alt', true);
      assert.match(panel()?.textContent ?? '', /More of the second/);
      assert.match(panel()?.textContent ?? '', /Alt\+Enter/);
      select(1);
      await type('ArrowUp', true);
      assert.match(panel()?.textContent ?? '', /More of the first/);
      await point(2, true);
      assert.match(panel()?.textContent ?? '', /More of the second/);
      assert.match(panel()?.textContent ?? '', /Alt\+Click/);
      await type('ArrowDown', true);
      assert.match(panel()?.textContent ?? '', /More of the first/);
      await key('keyup', 'Alt', false);
      assert.strictEqual(panel(), null);
    });
  });

  test('follows the pointer when Alt is pressed with the pointer over the list, though the list has the keyboard, whatever Alt repeats as it is held, until Alt+↑ or Alt+↓ steps through the commits', async () => {
    const commits = [
      commitInfo('w', { body: 'Working tree' }),
      commitInfo('a', { subject: 'First', body: 'More of the first' }),
      commitInfo('b', { subject: 'Second', body: 'More of the second' }),
    ];
    await inList(commits, async ({ panel, list, select, type, point, key }) => {
      assert.ok('focus' in list && typeof list.focus === 'function');
      list.focus();
      select(2);
      await point(1, false);
      await key('keydown', 'Alt', true);
      assert.match(panel()?.textContent ?? '', /More of the first/);
      await key('keydown', 'Alt', true, true);
      assert.match(panel()?.textContent ?? '', /More of the first/);
      await point(1, true);
      await key('keydown', 'Alt', true, true);
      assert.match(panel()?.textContent ?? '', /More of the first/);
      await type('ArrowDown', true);
      assert.match(panel()?.textContent ?? '', /More of the second/);
      await key('keydown', 'Alt', true, true);
      assert.match(panel()?.textContent ?? '', /More of the second/);
    });
  });

  test('shows the selected commit only while the list has the keyboard, forgetting the keys once Alt is let go, so Alt pressed in another column shows nothing without the pointer over the list', async () => {
    const commits = [
      commitInfo('w', { body: 'Working tree' }),
      commitInfo('a', { subject: 'First', body: 'More of the first' }),
      commitInfo('b', { subject: 'Second', body: 'More of the second' }),
    ];
    await inList(commits, async ({ panel, list, select, type, key }) => {
      assert.ok('focus' in list && typeof list.focus === 'function');
      assert.ok('blur' in list && typeof list.blur === 'function');
      list.focus();
      select(2);
      await type('Alt', true);
      await type('ArrowDown', true);
      assert.match(panel()?.textContent ?? '', /More of the second/);
      await key('keyup', 'Alt', false);
      list.blur();
      await key('keydown', 'Alt', true);
      assert.strictEqual(panel()?.textContent, undefined);
      await key('keyup', 'Alt', false);
      list.focus();
      await type('Alt', true);
      list.blur();
      await key('keydown', 'Alt', true, true);
      assert.strictEqual(panel()?.textContent, undefined);
    });
  });
});
