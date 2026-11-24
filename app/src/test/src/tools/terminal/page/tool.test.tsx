import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test, vi } from 'vitest';
import { TerminalTool } from '../../../../../tools/terminal/page/tool';
import { noop } from '../../../../helpers/fixtures';
import type { TerminalToWebview } from '../../../../../tools/terminal/shared/protocol';
import { renderIn, tabsStore } from '../../../../helpers/componentFixtures';
import { renderToStaticMarkup } from 'react-dom/server';
import { ShellStore } from '../../../../../shell/page/store';
import { allWithClass, rendered, withClass } from '../../../../helpers/markup';

const built = vi.hoisted((): string[] => []);

vi.mock('../../../../../tools/terminal/page/view', () => ({
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
      renderIn(
        root,
        <TerminalTool active={active} post={noop} listen={listen} />,
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
  test('stands the screen in a column under a bar of buttons, a find at its right that does nothing yet, and a row naming the folder of its shell, as the viewer and the editor name their file', () => {
    const shown = (
      <ShellStore
        value={tabsStore(
          [{ id: '1', tool: 'terminal', root: 'C:\\Users\\me', name: 'me' }],
          '1',
        )}
      >
        <TerminalTool active post={noop} listen={() => noop} />
      </ShellStore>
    );
    const html = renderToStaticMarkup(shown);
    const page = rendered(shown);
    const column = withClass(page, 'column', 'terminal');
    const actions = withClass(
      withClass(column, 'column-title'),
      'column-actions',
    );
    assert.deepStrictEqual(
      allWithClass(actions, 'search-button').map((button) =>
        button.attributes.get('disabled'),
      ),
      [''],
    );
    assert.match(
      html,
      /class="path-row terminal-path">.*>C:\\<.*>Users<.*>me</,
    );
    assert.strictEqual(
      allWithClass(withClass(column, 'column-body'), 'terminal-screen').length,
      1,
    );
  });

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
