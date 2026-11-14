import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test } from 'vitest';
import { CommanderTool } from '../../../../../tools/commander/page/tool';
import { createShellStore, ShellStore } from '../../../../../shell/page/store';
import type {
  CommanderToHost,
  CommanderToWebview,
} from '../../../../../tools/commander/shared/protocol';
import { strings } from '../../../../../lib/shared/strings';
import { noop } from '../../../../helpers/fixtures';

const listing = (side: 'left' | 'right'): CommanderToWebview => ({
  type: 'listing',
  tab: 'A',
  side,
  folder: side === 'left' ? 'C:\\' : 'C:\\work',
  hidden: [],
  entries: ['a.txt', 'b.txt'].map((name) => ({
    name,
    folder: false,
    link: false,
    hidden: false,
    size: 1,
    modified: 0,
  })),
  parent: true,
  back: false,
  forward: false,
  elevated: false,
  selected: 'a.txt',
});

const settings = (bookmarks: readonly string[]): CommanderToWebview => ({
  type: 'settings',
  showHidden: true,
  sort: {
    left: { column: 'extension', descending: false, groupByColor: false },
    right: { column: 'extension', descending: false, groupByColor: false },
  },
  columns: { extension: 10, size: 15, date: 16 },
  defaultColumns: { extension: 10, size: 15, date: 16 },
  canElevate: false,
  platform: 'win32',
  thumbnailSize: 144,
  fileColors: [],
  bookmarks,
});

suite('Commander bookmark keys', () => {
  test('opens the bookmarks of the active side on Ctrl+D with the item adding its folder focused, going to a bookmark on its key, closing on Ctrl+D again and giving the focus back to the side', async () => {
    const dom = new JSDOM('<!doctype html><main></main>', {
      pretendToBeVisual: true,
    });
    Object.assign(dom.window, {
      matchMedia: () => ({
        matches: false,
        addEventListener: noop,
        removeEventListener: noop,
      }),
    });
    const globals = {
      matchMedia: dom.window.matchMedia,
      window: dom.window,
      document: dom.window.document,
      Element: dom.window.Element,
      HTMLElement: dom.window.HTMLElement,
      Node: dom.window.Node,
      getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
      MutationObserver: dom.window.MutationObserver,
      requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
      cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
      ResizeObserver: class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
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
      const posted: CommanderToHost[] = [];
      let send: (message: CommanderToWebview) => void = noop;
      await act(async () => {
        root.render(
          <ShellStore value={createShellStore(noop)}>
            <CommanderTool
              active
              post={(message) => posted.push(message)}
              listen={(handler) => {
                send = handler;
                return noop;
              }}
            />
          </ShellStore>,
        );
      });
      await act(async () => {
        send({ type: 'show', tab: 'A' });
        send(listing('left'));
        send(listing('right'));
        send(settings(['C:\\Code', 'D:\\Work']));
      });
      const [, right] = document.querySelectorAll<HTMLElement>('.virtual-rows');
      await act(async () => right?.focus());
      const press = (key: string, init: Partial<KeyboardEventInit> = {}) =>
        act(async () => {
          (document.activeElement ?? document.body).dispatchEvent(
            new dom.window.KeyboardEvent('keydown', {
              key,
              bubbles: true,
              cancelable: true,
              ...init,
            }),
          );
        });
      const menuOf = (side: number) => {
        const pane = document.querySelectorAll('.commander-pane').item(side);
        return [...pane.querySelectorAll('.menu .menu-item')].map(
          (item) => item.textContent,
        );
      };
      const bookmarked = () =>
        posted.filter(
          (message) =>
            message.type === 'addBookmark' || message.type === 'goToBookmark',
        );

      const focused = () => document.activeElement?.textContent;

      await press('d', { ctrlKey: true });
      assert.deepStrictEqual(menuOf(0), []);
      assert.deepStrictEqual(menuOf(1), [
        strings.commander.addBookmark,
        '1C:\\Code',
        '2D:\\Work',
      ]);
      assert.strictEqual(focused(), strings.commander.addBookmark);
      await act(async () =>
        document.activeElement?.dispatchEvent(
          new dom.window.MouseEvent('click', { bubbles: true, detail: 0 }),
        ),
      );
      assert.deepStrictEqual(menuOf(1), []);
      assert.ok(document.activeElement === right);
      await press('d', { ctrlKey: true });
      await press('2');
      assert.deepStrictEqual(menuOf(1), []);
      await press('d', { ctrlKey: true });
      assert.strictEqual(menuOf(1).length, 3);
      await press('d', { ctrlKey: true });
      assert.deepStrictEqual(menuOf(1), []);

      assert.deepStrictEqual(bookmarked(), [
        { type: 'addBookmark', tab: 'A', side: 'right', folder: 'C:\\work' },
        { type: 'goToBookmark', tab: 'A', side: 'right', folder: 'D:\\Work' },
      ]);
      await act(async () => root.unmount());
    } finally {
      Object.assign(globalThis, saved);
    }
  });
});
