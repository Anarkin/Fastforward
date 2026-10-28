import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test } from 'vitest';
import type { ToWebviewOf } from '../../../shell/shared/protocol';
import { OpenWithPopup } from '../../../shell/page/openWithPopup';
import { strings } from '../../../shared/strings';
import { noop } from '../../fixtures';

function question(
  folders: readonly string[],
  picked: 'git' | 'files',
): ToWebviewOf<'chooseTool'> {
  return {
    type: 'chooseTool',
    folders,
    choices: [
      { tool: 'git', fits: picked === 'git' },
      { tool: 'files', fits: true },
      { tool: 'terminal', fits: true },
    ],
    picked,
  };
}

suite('Open With popup', () => {
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
      await act(async () => {
        root.render(
          <OpenWithPopup
            choice={question(['/plain'], 'files')}
            onOpen={noop}
            onClose={noop}
          />,
        );
      });
      assert.strictEqual(focused(), strings.tools.files);
      await act(async () => {
        root.render(
          <OpenWithPopup
            choice={question(['/repo'], 'git')}
            onOpen={noop}
            onClose={noop}
          />,
        );
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
        root.render(
          <OpenWithPopup
            choice={question(['/plain'], 'files')}
            onOpen={noop}
            onClose={noop}
          />,
        );
      });
      assert.strictEqual(focused(), strings.tools.files);
      assert.strictEqual(await press('ArrowDown'), strings.tools.terminal);
      assert.strictEqual(await press('ArrowDown'), strings.tools.files);
      assert.strictEqual(await press('ArrowUp'), strings.tools.terminal);
      assert.strictEqual(await press('Home'), strings.tools.files);
      assert.strictEqual(await press('End'), strings.tools.terminal);
      await act(async () => {
        root.unmount();
      });
    } finally {
      Object.assign(globalThis, saved);
    }
  });
});
