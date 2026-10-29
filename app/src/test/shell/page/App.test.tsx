import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { strings } from '../../../shared/strings';
import type { ToWebview } from '../../../shell/shared/protocol';
import type { ToolId } from '../../../shell/shared/tools';
import {
  App,
  emptyState,
  menuIn,
  newTabItems,
  nextMenu,
  withPopup,
} from '../../../shell/page/App';
import { noop, tagsWith } from '../../fixtures';

suite('Window', () => {
  test('says no tab is open only once the host says which tabs are', () => {
    const html = renderToStaticMarkup(
      <App name="Fastforward" post={noop} listen={() => noop} />,
    );
    assert.strictEqual(tagsWith(html, 'tabs').length, 1);
    assert.doesNotMatch(html, /No tab is open/);
    assert.strictEqual(emptyState(undefined), null);
    assert.strictEqual(
      renderToStaticMarkup(<>{emptyState([])}</>),
      '<div class="empty-state">No tab is open. Use + to open one. The app menu is at the top right.</div>',
    );
    assert.strictEqual(
      emptyState([{ id: '1', tool: 'files', name: strings.tools.files }]),
      null,
    );
  });

  test("tops the window with the tab row, starting with the app's icon and ending with its menu, and shows no title bar", () => {
    const html = renderToStaticMarkup(
      <App name="Fastforward" post={noop} listen={() => noop} />,
    );
    assert.strictEqual(tagsWith(html, 'title-bar').length, 0);
    assert.match(
      html,
      /^<div class="app"><nav class="tabs"[^>]*><svg class="title-bar-icon"[^]*<\/svg><div class="tab-list"[^]*<\/div><div class="menu-button"[^]*<\/nav>/,
    );
  });

  test('shows no worktree row before the host says which tab is open', () => {
    const html = renderToStaticMarkup(
      <App name="Fastforward" post={noop} listen={() => noop} />,
    );
    assert.strictEqual(tagsWith(html, 'worktrees').length, 0);
  });

  test('closes a menu once another tab is shown, as its items act on the one it opened in', () => {
    const menu = { x: 1, y: 2, items: [] };
    const opened = { tab: '1', menu, id: 1 };
    assert.strictEqual(menuIn(opened, '1'), menu);
    assert.strictEqual(menuIn(opened, '2'), undefined);
    assert.strictEqual(menuIn(opened, undefined), undefined);
    assert.strictEqual(
      menuIn({ tab: undefined, menu, id: 1 }, undefined),
      menu,
    );
    assert.strictEqual(menuIn(undefined, '1'), undefined);
  });

  test('opens each menu anew, so one opened over another, as the + menu over a commit menu, takes the focus and none of its submenus', () => {
    const menu = { x: 1, y: 2, items: [] };
    const first = nextMenu(undefined, '1', menu);
    const second = nextMenu(first, '1', menu);
    assert.notStrictEqual(first.id, second.id);
    assert.notStrictEqual(nextMenu(undefined, '1', menu).id, second.id);
  });

  test('shows a popup opened from inside another over it, as it takes the focus and the next Escape, keeping each where it is while it stays open', () => {
    const about = withPopup([], 'about', true);
    const both = withPopup(about, 'shortcuts', true);
    assert.deepStrictEqual(both, ['about', 'shortcuts']);
    assert.strictEqual(withPopup(both, 'about', true), both);
    assert.deepStrictEqual(withPopup(both, 'openWith', true), [
      'about',
      'shortcuts',
      'openWith',
    ]);
    assert.deepStrictEqual(withPopup(both, 'about', false), ['shortcuts']);
    assert.deepStrictEqual(
      withPopup(withPopup(both, 'about', false), 'about', true),
      ['shortcuts', 'about'],
    );
    assert.strictEqual(withPopup(about, 'shortcuts', false), about);
  });

  test('opens a popup asked for from inside another over it, as the newest takes the focus and the keys', async () => {
    const dom = new JSDOM('<!doctype html><main></main>', {
      pretendToBeVisual: true,
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
          choices: [{ tool: 'files', fits: true }],
          picked: 'files',
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

  test('offers every tool in the + menu by name, with its icon, as a submenu where the tool gives one, or opening a new tab of it', () => {
    const opened: ToolId[] = [];
    const recent = [{ label: 'main', onClick: noop }];
    const items = newTabItems({ git: recent }, (tool) => opened.push(tool));
    assert.deepStrictEqual(
      items.map((item) => ('label' in item ? item.label : undefined)),
      [strings.tools.git, strings.tools.files, strings.tools.terminal],
    );
    const [git, files] = items;
    assert.ok(git && 'label' in git && files && 'label' in files);
    assert.strictEqual(git.submenu, recent);
    assert.ok(git.icon !== undefined && files.icon !== undefined);
    files.onClick?.();
    assert.deepStrictEqual(opened, ['files']);
  });
});
