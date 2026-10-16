import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act, useRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import type { CommitInfo } from '../../shared/protocol';
import {
  holdingAfterKey,
  holdingAfterPointer,
  liftOf,
  MessageBody,
  MessagePanel,
  MessagePeek,
  showsMore,
  type PeekAnchor,
} from '../../webview/messagePeek';
import { commitInfo, keyPress, noModifiers, tagsWith } from '../fixtures';

const alt = { ...noModifiers, altKey: true };
const altDown = keyPress('Alt', { altKey: true });
const altUp = keyPress('Alt');

const anchor: PeekAnchor = {
  left: 40,
  top: 100,
  width: 200,
  truncated: true,
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
    ) => Promise<void>;
    readonly point: (row: number, altKey: boolean) => Promise<void>;
    readonly leave: () => Promise<void>;
    readonly blur: () => Promise<void>;
  }) => Promise<void>,
): Promise<void> {
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
  try {
    const { createRoot } = await import('react-dom/client');
    const { document } = dom.window;
    function List() {
      const list = useRef<HTMLDivElement>(null);
      return (
        <>
          <div ref={list} className="list">
            {commits.map((commit, index) => (
              <div key={index} className="virtual-row" data-index={index}>
                <div className={index === 0 ? 'commit working-tree' : 'commit'}>
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
            renderRow={(commit) => (
              <>
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
      key: (type, key, altKey) =>
        act(async () => {
          dom.window.dispatchEvent(
            new dom.window.KeyboardEvent(type, { key, altKey }),
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

  test('shows a message only when the row hides some of it, its subject cut short or more lines after it', () => {
    assert.ok(!showsMore(commitInfo('a'), false));
    assert.ok(showsMore(commitInfo('a'), true));
    assert.ok(showsMore(commitInfo('a', { body: 'More' }), false));
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

  test('writes the rest of a message as it is, and nothing for a message that has none', () => {
    assert.strictEqual(
      renderToStaticMarkup(<MessageBody text={'Body\n  more'} />),
      '<div class="message-body">Body\n  more</div>',
    );
    assert.strictEqual(renderToStaticMarkup(<MessageBody text="" />), '');
  });

  test('shows the message of the commit under the pointer while Alt alone is held, but not of the working tree, and hides it once Alt is let go, another key is pressed, the pointer leaves or the window loses focus', async () => {
    const commits = [
      commitInfo('w', { body: 'Working tree' }),
      commitInfo('a', { subject: 'First', body: 'More of the first' }),
      commitInfo('b', { subject: 'Second', body: 'More of the second' }),
    ];
    await inList(commits, async ({ panel, key, point, leave, blur }) => {
      await point(1, false);
      assert.strictEqual(panel(), null);
      await key('keydown', 'Alt', true);
      assert.match(panel()?.textContent ?? '', /More of the first/);
      await point(2, true);
      assert.match(panel()?.textContent ?? '', /More of the second/);
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
});
