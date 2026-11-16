import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act, useRef, useState } from 'react';
import { suite, test } from 'vitest';
import type { CommitInfo } from '../../../../../tools/git/shared/protocol';
import { MessagePeek } from '../../../../../tools/git/page/messagePeek';
import { MessageBody } from '../../../../../tools/git/page/messagePanel';
import type { KeptPin } from '../../../../../tools/git/page/gitState';
import { commitInfo } from '../../../../helpers/gitValues';

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
  kept: {
    readonly pin?: KeptPin;
    readonly pinned?: (pin: KeptPin | undefined) => void;
  } = {},
): Promise<void> {
  const dom = new JSDOM('<!doctype html><main></main>');
  const globals = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    requestAnimationFrame: (frame: () => void) => setTimeout(frame, 0),
    cancelAnimationFrame: (frame: number) => clearTimeout(frame),
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
      const [pin, setPin] = useState(kept.pin);
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
            keptPin={pin}
            onPin={(next) => {
              setPin(next);
              kept.pinned?.(next);
            }}
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

  test('pins the message of a commit clicked with Alt, without selecting it, one at a time, keeping it once Alt is let go while still peeking at others, until Escape, a click on it with Alt, a press outside it or a scroll of the list, but not a press on a tab or the window losing focus, as a tab shown again brings it back', async () => {
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
        list,
      }) => {
        const document = list.ownerDocument;
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
        const strip = document.createElement('div');
        strip.setAttribute('role', 'tablist');
        const tab = document.createElement('div');
        strip.append(tab);
        document.body.append(strip);
        await pressOn(tab);
        assert.ok(pinned() !== null, 'kept through a tab pressed');
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

  test('pins again the message kept pinned for the list once its row is drawn, as a tab shown again brings it back, telling the pins that follow', async () => {
    const commits = [
      commitInfo('w', { body: 'Working tree' }),
      commitInfo('a', { subject: 'First', body: 'More of the first' }),
      commitInfo('b', { subject: 'Second', body: 'More of the second' }),
    ];
    const told: (KeptPin | undefined)[] = [];
    await inList(
      commits,
      async ({ pinned, key }) => {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
        });
        assert.match(pinned()?.textContent ?? '', /More of the second/);
        assert.deepStrictEqual(told, []);
        await key('keydown', 'Escape', false);
        assert.ok(pinned() === null, 'unpinned');
        assert.deepStrictEqual(told, [undefined]);
      },
      {
        pin: { hash: commits[2]?.hash ?? '', byKey: false },
        pinned: (pin) => told.push(pin),
      },
    );
  });

  test('pins again a message pinned by its keys as pinned by its keys, its corner naming them, leaving the keyboard where the tab gives it back, and tells each pin how it was made', async () => {
    const commits = [
      commitInfo('w', { body: 'Working tree' }),
      commitInfo('a', { subject: 'First', body: 'More of the first' }),
      commitInfo('b', { subject: 'Second', body: 'More of the second' }),
    ];
    const told: (KeptPin | undefined)[] = [];
    await inList(
      commits,
      async ({ pinned, list, select, type }) => {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
        });
        assert.match(pinned()?.textContent ?? '', /More of the second/);
        const restored = pinned()?.querySelector('.message-hint')?.textContent;
        assert.ok(
          pinned()?.contains(document.activeElement) !== true,
          'the keyboard left where the tab gives it back',
        );
        assert.ok('focus' in list && typeof list.focus === 'function');
        list.focus();
        select(2);
        await type('Enter', true);
        assert.strictEqual(pinned(), null);
        await type('Enter', true);
        assert.strictEqual(
          pinned()?.querySelector('.message-hint')?.textContent,
          restored,
        );
        assert.deepStrictEqual(told, [
          undefined,
          { hash: commits[2]?.hash, byKey: true },
        ]);
      },
      {
        pin: { hash: commits[2]?.hash ?? '', byKey: true },
        pinned: (pin) => told.push(pin),
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
