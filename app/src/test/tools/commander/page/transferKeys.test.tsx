import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test } from 'vitest';
import { CommanderTool } from '../../../../tools/commander/page/tool';
import { createShellStore, ShellStore } from '../../../../shell/page/store';
import type {
  CommanderToHost,
  CommanderToWebview,
} from '../../../../tools/commander/shared/protocol';
import type { TransferView } from '../../../../tools/commander/shared/transfers';
import { noop } from '../../../fixtures';

const listing = (side: 'left' | 'right'): CommanderToWebview => ({
  type: 'listing',
  tab: 'A',
  side,
  folder: side === 'left' ? 'D:\\photos' : 'C:\\work',
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

const shownTransfer: TransferView = {
  id: 7,
  move: false,
  items: 1,
  name: 'a.txt',
  target: 'D:\\photos',
  progress: {
    files: 1,
    totalFiles: 2,
    bytes: 2048,
    totalBytes: 4096,
    current: 'a.txt',
  },
  stopping: false,
};

suite('Commander transfer keys', () => {
  test('asks on F5 before copying the selected file into the folder of the other side, shows how far the copy got, asks what to do with a file there already, and closes the dialog on Escape', async () => {
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
      });
      const [, right] = document.querySelectorAll<HTMLElement>('.virtual-rows');
      await act(async () => right?.focus());
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
      const click = (element: Element | null | undefined) =>
        act(async () => {
          element?.dispatchEvent(
            new dom.window.MouseEvent('click', { bubbles: true }),
          );
        });
      const dialogText = () =>
        document.querySelector('[role="dialog"]')?.textContent ?? '';
      const button = (text: string) =>
        [...document.querySelectorAll('.confirm-button')].find(
          (each) => each.textContent === text,
        );
      const fromPage = () =>
        posted.filter((message) =>
          ['transfer', 'answerClash', 'stopTransfer', 'hideTransfer'].includes(
            message.type,
          ),
        );

      await press('F5');
      assert.match(dialogText(), /Copy "a\.txt" to "D:\\photos"\?/);
      await click(button('Copy'));
      assert.deepStrictEqual(fromPage(), [
        {
          type: 'transfer',
          tab: 'A',
          side: 'right',
          folder: 'C:\\work',
          names: ['a.txt'],
          target: 'D:\\photos',
          move: false,
        },
      ]);

      await act(async () => send({ type: 'transfer', view: shownTransfer }));
      assert.match(dialogText(), /Copying "a\.txt" to "D:\\photos"/);
      assert.match(dialogText(), /1 of 2 files/);
      assert.match(dialogText(), /2\.0 KB of 4\.0 KB/);
      assert.strictEqual(
        document
          .querySelector('[role="progressbar"]')
          ?.getAttribute('aria-valuenow'),
        '50',
      );

      await act(async () =>
        send({
          type: 'transfer',
          view: {
            ...shownTransfer,
            clash: {
              name: 'a.txt',
              source: { size: 2048, modified: 0 },
              target: { size: 1024, modified: 0 },
              asked: 3,
            },
          },
        }),
      );
      assert.match(dialogText(), /"a\.txt" is there already\./);
      assert.strictEqual(document.activeElement?.textContent, 'Skip');
      await click(document.querySelector('.transfer-all input'));
      await click(button('Keep Both'));
      await press('Escape');

      assert.deepStrictEqual(fromPage().slice(1), [
        {
          type: 'answerClash',
          transfer: 7,
          asked: 3,
          answer: 'keepBoth',
          all: true,
        },
        { type: 'hideTransfer', transfer: 7 },
      ]);
      await act(async () => send({ type: 'transfer', view: undefined }));
      assert.strictEqual(document.querySelector('[role="dialog"]'), null);
      await act(async () => root.unmount());
    } finally {
      Object.assign(globalThis, saved);
    }
  });
});
