import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { strings } from '../../../../lib/shared/strings';
import type { ToHost, ToWebview } from '../../../../shell/shared/protocol';
import { App } from '../../../../shell/page/App';
import { noop } from '../../../helpers/fixtures';
import { tagsWith } from '../../../helpers/markup';
import { withStillMediaQueries } from '../../../helpers/mediaQueries';

suite('Window', () => {
  test('shows a window with no tab as its row of tabs alone, the + and the icon of the app telling how to open one, with no words below', () => {
    const html = renderToStaticMarkup(
      <App name="Fastforward" post={noop} listen={() => noop} />,
    );
    assert.strictEqual(tagsWith(html, 'tabs').length, 1);
    assert.strictEqual(tagsWith(html, 'empty-state').length, 0);
  });

  test("tops the window with the tab row, starting with the app's icon, which opens the app's menu, and shows no title bar", () => {
    const html = renderToStaticMarkup(
      <App name="Fastforward" post={noop} listen={() => noop} />,
    );
    assert.strictEqual(tagsWith(html, 'title-bar').length, 0);
    assert.strictEqual(tagsWith(html, 'menu-button').length, 1);
    assert.match(
      html,
      /^<div class="app"><nav class="tabs"[^>]*><div class="menu-button"><button [^>]*aria-haspopup="menu"[^>]*><svg class="title-bar-icon"[^]*?<\/svg><\/button><\/div><div class="tab-list"[^]*<\/div><\/nav>/,
    );
  });

  test('shows no worktree row before the host says which tab is open', () => {
    const html = renderToStaticMarkup(
      <App name="Fastforward" post={noop} listen={() => noop} />,
    );
    assert.strictEqual(tagsWith(html, 'worktrees').length, 0);
  });

  test('opens a popup asked for from inside another over it, as the newest takes the focus and the keys', async () => {
    const dom = new JSDOM('<!doctype html><main></main>', {
      pretendToBeVisual: true,
    });
    withStillMediaQueries(dom.window);
    const globals = {
      window: dom.window,
      document: dom.window.document,
      Element: dom.window.Element,
      HTMLElement: dom.window.HTMLElement,
      getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
      MutationObserver: dom.window.MutationObserver,
      requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
      cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
      ResizeObserver: class {
        observe() {}
        disconnect() {}
      },
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    const saved = Object.fromEntries(
      Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
    );
    Object.assign(globalThis, globals);
    try {
      const { createRoot } = await import('react-dom/client');
      const { document } = dom.window;
      const main = document.querySelector('main');
      assert.ok(main);
      const root = createRoot(main);
      let send: (message: ToWebview) => void = noop;
      await act(async () => {
        root.render(
          <App
            name="Fastforward"
            post={noop}
            listen={(handler) => {
              send = handler;
              return noop;
            }}
          />,
        );
      });
      const press = (key: string, shiftKey = false) =>
        act(async () => {
          (document.activeElement ?? document.body).dispatchEvent(
            new dom.window.KeyboardEvent('keydown', {
              key,
              shiftKey,
              bubbles: true,
              cancelable: true,
            }),
          );
        });
      const focusedAmong = () =>
        Array.from(document.querySelectorAll('[role="dialog"]'), (dialog) =>
          dialog.contains(document.activeElement),
        );
      await act(async () => {
        send({
          type: 'about',
          version: '1.2.3',
          development: false,
          git: '2.52.0',
          system: 'Windows 11',
        });
      });
      await press('F1', true);
      await press('F1');
      assert.deepStrictEqual(focusedAmong(), [false, true]);
      await act(async () => {
        send({
          type: 'chooseTool',
          folders: ['/repo'],
          choices: [{ tool: 'commander', fits: true }],
          picked: 'commander',
        });
      });
      await press('F1', true);
      await press('F1', true);
      assert.deepStrictEqual(focusedAmong(), [false, false, true]);
      await act(async () => {
        root.unmount();
      });
    } finally {
      Object.assign(globalThis, saved);
    }
  });

  test('opens a popup asked for while a confirmation is up over it, and a confirmation over the popups open before it, as the one underneath held the focus and the next Escape', async () => {
    const dom = new JSDOM('<!doctype html><main></main>', {
      pretendToBeVisual: true,
    });
    withStillMediaQueries(dom.window);
    const globals = {
      window: dom.window,
      document: dom.window.document,
      Element: dom.window.Element,
      HTMLElement: dom.window.HTMLElement,
      getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
      MutationObserver: dom.window.MutationObserver,
      requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
      cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
      ResizeObserver: class {
        observe() {}
        disconnect() {}
      },
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    const saved = Object.fromEntries(
      Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
    );
    Object.assign(globalThis, globals);
    try {
      const { createRoot } = await import('react-dom/client');
      const { document } = dom.window;
      const main = document.querySelector('main');
      assert.ok(main);
      const root = createRoot(main);
      const posted: ToHost[] = [];
      let send: (message: ToWebview) => void = noop;
      await act(async () => {
        root.render(
          <App
            name="Fastforward"
            post={(message) => posted.push(message)}
            listen={(handler) => {
              send = handler;
              return noop;
            }}
          />,
        );
      });
      const press = (key: string) =>
        act(async () => {
          (document.activeElement ?? document.body).dispatchEvent(
            new dom.window.KeyboardEvent('keydown', {
              key,
              bubbles: true,
              cancelable: true,
            }),
          );
        });
      const dialogs = () =>
        Array.from(document.querySelectorAll('[role="dialog"]'), (dialog) => [
          dialog.getAttribute('aria-label'),
          dialog.contains(document.activeElement),
        ]);
      await act(async () => {
        send({ type: 'confirmQuit' });
      });
      await press('F1');
      assert.deepStrictEqual(dialogs(), [
        [strings.confirm.quitTitle, false],
        [strings.shortcuts.title, true],
      ]);
      await press('Escape');
      assert.deepStrictEqual(dialogs(), [[strings.confirm.quitTitle, true]]);
      await press('F1');
      await act(async () => {
        send({ type: 'confirmQuit' });
      });
      assert.deepStrictEqual(dialogs(), [
        [strings.confirm.quitTitle, false],
        [strings.shortcuts.title, true],
      ]);
      await press('Escape');
      await press('Escape');
      assert.deepStrictEqual(dialogs(), []);
      assert.deepStrictEqual(
        posted.filter((message) => message.type === 'quit'),
        [],
      );
      await act(async () => {
        root.unmount();
      });
    } finally {
      Object.assign(globalThis, saved);
    }
  });

  test('closes the newest notice with Escape once nothing else takes the key, as a popup open', async () => {
    const dom = new JSDOM('<!doctype html><main></main>', {
      pretendToBeVisual: true,
    });
    withStillMediaQueries(dom.window);
    const globals = {
      window: dom.window,
      document: dom.window.document,
      Element: dom.window.Element,
      HTMLElement: dom.window.HTMLElement,
      getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
      MutationObserver: dom.window.MutationObserver,
      requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
      cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
      ResizeObserver: class {
        observe() {}
        disconnect() {}
      },
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    const saved = Object.fromEntries(
      Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
    );
    Object.assign(globalThis, globals);
    try {
      const { createRoot } = await import('react-dom/client');
      const { document } = dom.window;
      const main = document.querySelector('main');
      assert.ok(main);
      const root = createRoot(main);
      let send: (message: ToWebview) => void = noop;
      await act(async () => {
        root.render(
          <App
            name="Fastforward"
            post={noop}
            listen={(handler) => {
              send = handler;
              return noop;
            }}
          />,
        );
      });
      const press = (key: string) =>
        act(async () => {
          (document.activeElement ?? document.body).dispatchEvent(
            new dom.window.KeyboardEvent('keydown', {
              key,
              bubbles: true,
              cancelable: true,
            }),
          );
        });
      const shown = () =>
        Array.from(
          document.querySelectorAll('.card-message'),
          (message) => message.textContent,
        );
      await act(async () => {
        send({ type: 'notice', level: 'error', message: 'first' });
        send({ type: 'notice', level: 'error', message: 'second' });
      });
      assert.deepStrictEqual(shown(), ['first', 'second']);

      await press('F1');
      await press('Escape');
      assert.strictEqual(document.querySelector('[role="dialog"]'), null);
      assert.deepStrictEqual(shown(), ['first', 'second']);

      await press('Escape');
      assert.deepStrictEqual(shown(), ['first']);
      await press('Escape');
      assert.deepStrictEqual(shown(), []);
      await act(async () => {
        root.unmount();
      });
    } finally {
      Object.assign(globalThis, saved);
    }
  });

  test('lets a tool take Escape before the window dismisses a notice with it, as two files compared in a tab of their own close on Escape', async () => {
    const dom = new JSDOM('<!doctype html><main></main>', {
      pretendToBeVisual: true,
    });
    dom.window.matchMedia = () =>
      Object.assign(new dom.window.EventTarget(), {
        matches: false,
        media: '',
        onchange: null,
        addListener: noop,
        removeListener: noop,
      });
    const globals = {
      window: dom.window,
      document: dom.window.document,
      Element: dom.window.Element,
      HTMLElement: dom.window.HTMLElement,
      getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
      MutationObserver: dom.window.MutationObserver,
      requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
      cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
      ResizeObserver: class {
        observe() {}
        disconnect() {}
      },
      devicePixelRatio: 1,
      innerWidth: dom.window.innerWidth,
      innerHeight: dom.window.innerHeight,
      matchMedia: dom.window.matchMedia,
      location: new URL('file:///page/index.html'),
      Worker: class {
        postMessage() {}
        addEventListener() {}
      },
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    const saved = Object.fromEntries(
      Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
    );
    Object.assign(globalThis, globals);
    try {
      const { createRoot } = await import('react-dom/client');
      const { document } = dom.window;
      const main = document.querySelector('main');
      assert.ok(main);
      const root = createRoot(main);
      const posted: ToHost[] = [];
      let send: (message: ToWebview) => void = noop;
      await act(async () => {
        root.render(
          <App
            name="Fastforward"
            post={(message) => posted.push(message)}
            listen={(handler) => {
              send = handler;
              return noop;
            }}
          />,
        );
      });
      await act(async () => {
        send({
          type: 'tabs',
          tabs: [{ id: 'c', tool: 'diff', name: 'a.txt' }],
          active: 'c',
        });
        send({
          type: 'tool',
          tool: 'diff',
          message: {
            type: 'show',
            tab: 'c',
            settings: {
              showEntireFile: false,
              ignoreWhitespace: true,
              diffLayout: 'sideBySide',
            },
          },
        });
        send({ type: 'notice', level: 'error', message: 'kept' });
      });
      await act(async () => {
        document.body.dispatchEvent(
          new dom.window.KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      assert.deepStrictEqual(
        posted.filter((message) => message.type === 'closeTab'),
        [{ type: 'closeTab', tab: 'c' }],
      );
      assert.deepStrictEqual(
        Array.from(
          document.querySelectorAll('.card-message'),
          (message) => message.textContent,
        ),
        ['kept'],
      );
      await act(async () => {
        root.unmount();
      });
    } finally {
      Object.assign(globalThis, saved);
    }
  });
});
