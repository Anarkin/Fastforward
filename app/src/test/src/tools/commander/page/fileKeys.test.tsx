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
import type { TransferView } from '../../../../../tools/commander/shared/transfers';
import { strings } from '../../../../../lib/shared/strings';
import { noop } from '../../../../helpers/fixtures';

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

const settings: CommanderToWebview = {
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
  bookmarks: [],
};

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

const clashOf = (itself: boolean): CommanderToWebview => ({
  type: 'transfer',
  view: {
    id: 7,
    move: false,
    items: 1,
    target: 'C:\\work',
    stopping: false,
    clash: {
      name: 'a.txt',
      source: { size: 1024, modified: 0 },
      target: { size: 1024, modified: 0 },
      keptAs: 'a (2).txt',
      asked: 3,
      ...(itself && { itself }),
    },
  },
});

async function inCommander(
  run: (commander: {
    readonly document: Document;
    readonly posted: CommanderToHost[];
    readonly send: (message: CommanderToWebview) => Promise<void>;
    readonly press: (
      key: string,
      modifiers?: { readonly shiftKey?: boolean },
    ) => Promise<void>;
    readonly click: (element: Element | null | undefined) => Promise<void>;
    readonly type: (text: string) => Promise<void>;
    readonly dialogText: () => string;
    readonly dialogLines: () => string[];
    readonly button: (text: string) => HTMLButtonElement | undefined;
  }) => Promise<void>,
): Promise<void> {
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
    let told: (message: CommanderToWebview) => void = noop;
    await act(async () => {
      root.render(
        <ShellStore value={createShellStore(noop)}>
          <CommanderTool
            active
            post={(message) => posted.push(message)}
            listen={(handler) => {
              told = handler;
              return noop;
            }}
          />
        </ShellStore>,
      );
    });
    const send = (message: CommanderToWebview) =>
      act(async () => told(message));
    await send({ type: 'show', tab: 'A' });
    await send(settings);
    await send(listing('left'));
    await send(listing('right'));
    const [, right] = document.querySelectorAll<HTMLElement>('.virtual-rows');
    await act(async () => right?.focus());
    await run({
      document,
      posted,
      send,
      press: (key, modifiers = {}) =>
        act(async () => {
          (document.activeElement ?? document.body).dispatchEvent(
            new dom.window.KeyboardEvent('keydown', {
              key,
              bubbles: true,
              cancelable: true,
              ...modifiers,
            }),
          );
        }),
      click: (element) =>
        act(async () => {
          element?.dispatchEvent(
            new dom.window.MouseEvent('click', { bubbles: true }),
          );
        }),
      type: (text) =>
        act(async () => {
          const field = document.activeElement;
          assert.ok(field instanceof dom.window.HTMLInputElement);
          Reflect.set(
            dom.window.HTMLInputElement.prototype,
            'value',
            text,
            field,
          );
          field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        }),
      dialogText: () =>
        document.querySelector('[role="dialog"]')?.textContent ?? '',
      dialogLines: () =>
        [...document.querySelectorAll('[role="dialog"] .name-value')].map(
          (value) => {
            const label = value.previousElementSibling;
            return `${label?.classList.contains('name-label') === true ? label.textContent : ''} ${value.textContent}`.trim();
          },
        ),
      button: (text) =>
        [...document.querySelectorAll('.confirm-button')].find(
          (each): each is HTMLButtonElement =>
            each instanceof dom.window.HTMLButtonElement &&
            each.textContent === text,
        ),
    });
    await act(async () => root.unmount());
  } finally {
    Object.assign(globalThis, saved);
  }
}

suite('Commander file keys', () => {
  test('asks on F5 before copying the selected file into the folder of the other side, shows how far the copy got, asks what to do with a file there already, and closes the dialog on Escape', () =>
    inCommander(
      async ({
        document,
        posted,
        send,
        press,
        click,
        dialogText,
        dialogLines,
        button,
      }) => {
        const fromPage = () =>
          posted.filter((message) =>
            [
              'transfer',
              'answerClash',
              'stopTransfer',
              'hideTransfer',
            ].includes(message.type),
          );

        await press('F5');
        assert.deepStrictEqual(dialogLines(), [
          'C:\\work\\a.txt',
          'To D:\\photos',
        ]);
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

        await send({ type: 'transfer', view: shownTransfer });
        assert.deepStrictEqual(dialogLines(), ['a.txt', 'To D:\\photos']);
        assert.match(dialogText(), /1 of 2 files/);
        assert.match(dialogText(), /2\.0 KB of 4\.0 KB/);
        assert.strictEqual(
          document
            .querySelector('[role="progressbar"]')
            ?.getAttribute('aria-valuenow'),
          '50',
        );

        await send({
          type: 'transfer',
          view: {
            ...shownTransfer,
            clash: {
              name: 'a.txt',
              source: { size: 2048, modified: 0 },
              target: { size: 1024, modified: 0 },
              keptAs: 'a (2).txt',
              asked: 3,
            },
          },
        });
        assert.strictEqual(
          document.querySelector('.transfer-clash')?.textContent,
          'It is there already.',
        );
        assert.deepStrictEqual(
          [...(document.querySelector('.transfer-sides')?.children ?? [])]
            .slice(0, 3)
            .map((cell) => cell.textContent),
          ['', 'D:\\photos\\a.txt', 'Copying'],
        );
        assert.ok(!dialogText().includes(strings.commander.clashReadOnly));
        await send({
          type: 'transfer',
          view: {
            ...shownTransfer,
            clash: {
              name: 'a.txt',
              source: { size: 2048, modified: 0 },
              target: { size: 1024, modified: 0, readOnly: true },
              keptAs: 'a (2).txt',
              asked: 3,
            },
          },
        });
        assert.ok(dialogText().includes(strings.commander.clashReadOnly));
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
        await send({ type: 'transfer', view: undefined });
        assert.strictEqual(document.querySelector('[role="dialog"]'), null);
      },
    ));

  test('asks on Shift+F5 for the name to copy the selected file under into the folder of the other side, suggesting the first free name with the part before its extension selected, saying what is wrong with a name as it is typed, and copies it under the name given', () =>
    inCommander(
      async ({ document, posted, press, type, click, dialogLines, button }) => {
        await press('F5', { shiftKey: true });
        assert.deepStrictEqual(dialogLines(), [
          'C:\\work\\a.txt',
          'To D:\\photos',
        ]);
        const field = document.querySelector<HTMLInputElement>('.prompt-input');
        assert.strictEqual(document.activeElement, field);
        assert.deepStrictEqual(
          [field?.value, field?.selectionStart, field?.selectionEnd],
          ['a (2).txt', 0, 5],
        );
        assert.deepStrictEqual(
          [
            field?.parentElement?.className,
            field?.previousElementSibling?.textContent,
          ],
          ['name-lines', strings.commander.copyAsField],
        );
        await type('b.txt');
        assert.strictEqual(
          document.querySelector('.prompt-problem')?.textContent,
          strings.commander.nameThere,
        );
        assert.strictEqual(button(strings.commander.copyTitle)?.disabled, true);
        await type('c.txt');
        await click(button(strings.commander.copyTitle));

        assert.deepStrictEqual(
          posted.filter((message) => message.type === 'copyAs'),
          [
            {
              type: 'copyAs',
              tab: 'A',
              side: 'right',
              folder: 'C:\\work',
              name: 'a.txt',
              target: 'D:\\photos',
              to: 'c.txt',
            },
          ],
        );
      },
    ));

  test('says under what name Keep Both keeps an item there already, and of an item copied onto itself, as into its own folder, that it is the item itself, offering no Overwrite', () =>
    inCommander(async ({ document, send, button }) => {
      const sides = () =>
        [...(document.querySelector('.transfer-sides')?.children ?? [])].map(
          (cell) => cell.textContent,
        );
      await send(clashOf(false));
      assert.deepStrictEqual(sides().slice(-2), [
        strings.commander.keepBothAs,
        'a (2).txt',
      ]);
      assert.strictEqual(button(strings.commander.overwrite)?.disabled, false);

      await send(clashOf(true));
      assert.deepStrictEqual(sides().slice(4), [
        strings.commander.clashThere,
        strings.commander.clashItself,
        strings.commander.keepBothAs,
        'a (2).txt',
      ]);
      assert.strictEqual(button(strings.commander.overwrite)?.disabled, true);
    }));

  test('asks on F7 for the name of a folder to make in the folder of the side, saying what is wrong with a name as it is typed and making none of it, and makes the one named without the spaces around it', () =>
    inCommander(
      async ({ document, posted, press, click, type, dialogLines, button }) => {
        const made = () =>
          posted.filter((message) => message.type === 'newFolder');
        const problem = () =>
          document.querySelector('.prompt-problem')?.textContent;
        const make = () => button(strings.commander.makeFolder);

        await press('F7');
        assert.deepStrictEqual(dialogLines(), ['C:\\work']);
        assert.strictEqual(document.activeElement?.className, 'prompt-input');
        assert.strictEqual(problem(), undefined);
        assert.strictEqual(make()?.disabled, true);

        await type('A.TXT');
        assert.strictEqual(problem(), strings.commander.nameThere);
        assert.strictEqual(make()?.disabled, true);
        await type('con');
        assert.strictEqual(
          document.querySelector('.prompt-problem')?.innerHTML,
          'Windows keeps the name <code class="name named-path"><span class="path-piece"><span class="path-part">con</span></span></code> for itself.',
        );
        await type('  photos  ');
        assert.strictEqual(problem(), undefined);
        await click(make());

        await press('F7');
        await type('later');
        await press('Escape');

        assert.strictEqual(document.querySelector('[role="dialog"]'), null);
        assert.deepStrictEqual(made(), [
          {
            type: 'newFolder',
            tab: 'A',
            side: 'right',
            folder: 'C:\\work',
            name: 'photos',
          },
        ]);
      },
    ));
});
