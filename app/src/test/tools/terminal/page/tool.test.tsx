import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test, vi } from 'vitest';
import { TerminalTool } from '../../../../tools/terminal/page/tool';
import { noop } from '../../../fixtures';
import type { TerminalToWebview } from '../../../../tools/terminal/shared/protocol';

const built = vi.hoisted((): string[] => []);

vi.mock('../../../../tools/terminal/page/view', () => ({
  loadXterm: () => Promise.resolve({}),
  TerminalView: class {
    constructor(_xterm: unknown, _element: unknown, options: { tab: string }) {
      built.push(options.tab);
    }

    receive(): void {}

    dispose(): void {}
  },
}));

const settings: TerminalToWebview = {
  type: 'settings',
  renderer: 'dom',
  scrollback: 1000,
  minimumContrastRatio: 4.5,
  windowsPty: undefined,
};

async function withTerminal(
  run: (
    show: (active: boolean, ...messages: TerminalToWebview[]) => void,
  ) => Promise<void>,
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
    const main = dom.window.document.querySelector('main');
    assert.ok(main);
    const root = createRoot(main);
    const listeners = new Set<(message: TerminalToWebview) => void>();
    const listen = (handler: (message: TerminalToWebview) => void) => {
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    };
    const show = (active: boolean, ...messages: TerminalToWebview[]) => {
      root.render(
        <TerminalTool
          active={active}
          post={noop}
          listen={listen}
          onCopy={noop}
          onNewTabItems={noop}
        />,
      );
      for (const message of messages) {
        for (const listener of listeners) {
          listener(message);
        }
      }
    };
    try {
      await run(show);
    } finally {
      await act(async () => root.unmount());
    }
  } finally {
    Object.assign(globalThis, saved);
  }
}

suite('Terminal page', () => {
  test('shows the tab the main process shows though the show comes before the page has done going to another tool and back, as when a tab of another tool is closed right after it opens', async () => {
    built.length = 0;
    await withTerminal(async (show) => {
      await act(async () => show(true));
      await act(async () => show(true, settings, { type: 'show', tab: '1' }));
      assert.deepStrictEqual(built, ['1']);
      await act(async () => {
        show(false, { type: 'hide' });
        show(false, { type: 'show', tab: '1' });
      });
      await act(async () => show(true));
      assert.deepStrictEqual(built, ['1', '1']);
    });
  });

  test('shows no terminal on coming back until the main process says which tab to show', async () => {
    built.length = 0;
    await withTerminal(async (show) => {
      await act(async () => show(true));
      await act(async () => show(true, settings, { type: 'show', tab: '1' }));
      await act(async () => show(false, { type: 'hide' }));
      await act(async () => show(true));
      assert.deepStrictEqual(built, ['1']);
      await act(async () => show(true, { type: 'show', tab: '2' }));
      assert.deepStrictEqual(built, ['1', '2']);
    });
  });
});
