import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test } from 'vitest';
import type { ToWebviewOf } from '../../../shell/shared/protocol';
import { OpenWithPopup } from '../../../shell/page/openWithPopup';
import { strings } from '../../../lib/shared/strings';
import { createShellStore, ShellStore } from '../../../shell/page/store';
import { renderIn } from '../../componentFixtures';

const noop = () => undefined;

function choosingStore(choice: ToWebviewOf<'chooseTool'>) {
  return createShellStore(noop, { choosing: choice, popups: ['openWith'] });
}

function question(
  folders: readonly string[],
  picked: 'git' | 'commander',
): ToWebviewOf<'chooseTool'> {
  return {
    type: 'chooseTool',
    folders,
    choices: [
      { tool: 'git', fits: picked === 'git' },
      { tool: 'commander', fits: true },
      { tool: 'terminal', fits: true },
    ],
    picked,
  };
}

suite('Open With popup', () => {
  test('names each folder it opens on a line of its own, as a name', async () => {
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
      const main = dom.window.document.querySelector('main');
      assert.ok(main);
      const root = createRoot(main);
      const store = choosingStore(question(['C:\\one', 'C:\\two'], 'git'));
      await act(async () => {
        renderIn(
          root,
          <ShellStore value={store}>
            <OpenWithPopup />
          </ShellStore>,
        );
      });
      assert.deepStrictEqual(
        Array.from(
          dom.window.document.querySelectorAll(
            '.open-with-folders > * > code.name',
          ),
          (name) => name.textContent,
        ),
        ['C:\\one', 'C:\\two'],
      );
      await act(async () => root.unmount());
    } finally {
      Object.assign(globalThis, saved);
    }
  });

  test('focuses the tool picked for the folders, and again once another question picks another while it is open', async () => {
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
      const main = dom.window.document.querySelector('main');
      assert.ok(main);
      const root = createRoot(main);
      const focused = () => dom.window.document.activeElement?.textContent;
      const store = choosingStore(question(['/plain'], 'commander'));
      await act(async () => {
        renderIn(
          root,
          <ShellStore value={store}>
            <OpenWithPopup />
          </ShellStore>,
        );
      });
      assert.strictEqual(focused(), strings.tools.commander);
      await act(async () => {
        store.getState().receive(question(['/repo'], 'git'));
      });
      assert.strictEqual(focused(), strings.tools.git);
      await act(async () => {
        root.unmount();
      });
    } finally {
      Object.assign(globalThis, saved);
    }
  });

  test('moves between the tools that can open the folders by the arrows, Home and End, as menus do, wrapping around', async () => {
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
      const main = dom.window.document.querySelector('main');
      assert.ok(main);
      const root = createRoot(main);
      const focused = () => dom.window.document.activeElement?.textContent;
      const press = async (key: string) => {
        await act(async () => {
          dom.window.document.activeElement?.dispatchEvent(
            new dom.window.KeyboardEvent('keydown', {
              key,
              bubbles: true,
              cancelable: true,
            }),
          );
        });
        return focused();
      };
      await act(async () => {
        renderIn(
          root,
          <ShellStore value={choosingStore(question(['/plain'], 'commander'))}>
            <OpenWithPopup />
          </ShellStore>,
        );
      });
      assert.strictEqual(focused(), strings.tools.commander);
      assert.strictEqual(await press('ArrowDown'), strings.tools.terminal);
      assert.strictEqual(await press('ArrowDown'), strings.tools.commander);
      assert.strictEqual(await press('ArrowUp'), strings.tools.terminal);
      assert.strictEqual(await press('Home'), strings.tools.commander);
      assert.strictEqual(await press('End'), strings.tools.terminal);
      await act(async () => {
        root.unmount();
      });
    } finally {
      Object.assign(globalThis, saved);
    }
  });
});
