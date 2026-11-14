import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test } from 'vitest';
import { CommanderTool } from '../../../../../tools/commander/page/tool';
import { createShellStore, ShellStore } from '../../../../../shell/page/store';
import type { CommanderToWebview } from '../../../../../tools/commander/shared/protocol';
import { noop } from '../../../../support/fixtures';

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

suite('Commander drive keys', () => {
  test('leaves the other side active once its drive menu, opened by its key, closes, as the menu gave the keyboard back to the side it was opened from', async () => {
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
      let send: (message: CommanderToWebview) => void = noop;
      await act(async () => {
        root.render(
          <ShellStore value={createShellStore(noop)}>
            <CommanderTool
              active
              post={noop}
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
        send({ type: 'drives', drives: ['C:\\', 'D:\\'] });
      });
      const [left] = document.querySelectorAll<HTMLElement>('.virtual-rows');
      await act(async () => left?.focus());
      const activeSide = () =>
        document
          .querySelector('.commander-columns')
          ?.getAttribute('data-active-side');
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
      assert.strictEqual(activeSide(), 'left');
      await press('F2', { altKey: true });
      assert.strictEqual(activeSide(), 'right');
      await press('Escape');
      assert.strictEqual(activeSide(), 'right');
      await act(async () => root.unmount());
    } finally {
      Object.assign(globalThis, saved);
    }
  });
});
