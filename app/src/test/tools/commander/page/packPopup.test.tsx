import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test } from 'vitest';
import { strings } from '../../../../shared/strings';
import { PackPopup } from '../../../../tools/commander/page/packPopup';
import {
  CommanderStore,
  createCommanderStore,
} from '../../../../tools/commander/page/store';
import {
  emptyView,
  type PaneView,
} from '../../../../tools/commander/page/view';
import type { CommanderToHost } from '../../../../tools/commander/shared/protocol';
import { renderIn } from '../../../componentFixtures';

const pane = (folder: string): PaneView => ({
  folder,
  hidden: [],
  entries: [],
  parent: true,
  back: false,
  forward: false,
  elevated: false,
  sort: { column: 'name', descending: false, groupByColor: false },
  rows: [],
  selected: undefined,
  marked: new Set(),
  repositories: new Set(),
  counting: 0,
});

async function packing(
  run: (dialog: {
    readonly dom: JSDOM;
    readonly posted: CommanderToHost[];
    readonly field: (label: string) => HTMLInputElement;
    readonly type: (label: string, value: string) => Promise<void>;
    readonly click: (text: string) => Promise<void>;
    readonly problem: () => string | undefined;
    readonly packable: () => boolean;
  }) => Promise<void>,
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
    const posted: CommanderToHost[] = [];
    const store = createCommanderStore((message) => posted.push(message), {
      view: {
        ...emptyView,
        tab: '1',
        platform: 'linux',
        panes: { left: pane('/code'), right: pane('/backup') },
      },
    });
    store.getState().askPack('left', ['a.txt', 'docs']);
    await act(async () => {
      renderIn(
        root,
        <CommanderStore value={store}>
          <PackPopup />
        </CommanderStore>,
      );
    });
    const { document } = dom.window;
    const field = (label: string) => {
      const found = [...document.querySelectorAll('label')].find(
        (each) => each.textContent === label,
      );
      const input = document.getElementById(found?.htmlFor ?? '');
      assert.ok(input instanceof dom.window.HTMLInputElement, label);
      return input;
    };
    await run({
      dom,
      posted,
      field,
      type: async (label, value) => {
        const input = field(label);
        await act(async () => {
          Object.getOwnPropertyDescriptor(
            dom.window.HTMLInputElement.prototype,
            'value',
          )?.set?.call(input, value);
          input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        });
      },
      click: async (text) => {
        const target = [...document.querySelectorAll('button, label')].find(
          (each) => each.textContent === text,
        );
        assert.ok(target instanceof dom.window.HTMLElement, text);
        await act(async () => {
          target.click();
        });
      },
      problem: () =>
        document.querySelector('[role="alert"]')?.textContent ?? undefined,
      packable: () =>
        document.querySelector<HTMLButtonElement>('button[type="submit"]')
          ?.disabled === false,
    });
    await act(async () => root.unmount());
  } finally {
    Object.assign(globalThis, saved);
  }
}

suite('Pack popup', () => {
  test('starts from an archive in the folder of the other side named after the folder of the items, its name selected, and packs it with the format, compression, password, names encrypted and volumes chosen', async () => {
    await packing(async ({ dom, posted, field, type, click }) => {
      const { commander } = strings;
      const archive = field(commander.packArchive);
      assert.deepStrictEqual(
        [
          archive.value,
          archive.value.slice(
            archive.selectionStart ?? 0,
            archive.selectionEnd ?? 0,
          ),
          dom.window.document.activeElement === archive,
        ],
        ['/backup/code.zip', 'code', true],
      );
      await click(commander.packFormats['7z']);
      assert.strictEqual(archive.value, '/backup/code.7z');
      await click(commander.packLevels.ultra);
      await type(commander.packPassword, 'pässwörd');
      await click(commander.encryptNames);
      await click(commander.splitVolumes);
      await click(commander.volumeCd);
      await click(commander.packConfirm);

      assert.deepStrictEqual(
        posted.filter((message) => message.type === 'pack'),
        [
          {
            type: 'pack',
            tab: '1',
            side: 'left',
            folder: '/code',
            names: ['a.txt', 'docs'],
            archive: '/backup/code.7z',
            format: '7z',
            level: 'ultra',
            password: 'pässwörd',
            encryptNames: true,
            volumeBytes: 734_003_200,
            test: true,
          },
        ],
      );
    });
  });

  test('says what is wrong as it is typed and packs nothing until it is right: no path, a zip password beyond ASCII, a volume too small or unread', async () => {
    await packing(async ({ type, click, problem, packable }) => {
      const { commander } = strings;
      await type(commander.packArchive, ' ');
      assert.deepStrictEqual(
        [problem(), packable()],
        [commander.noArchive, false],
      );
      await type(commander.packArchive, '/backup/code.zip');
      await type(commander.packPassword, 'pässwörd');
      assert.deepStrictEqual(
        [problem(), packable()],
        [commander.zipPasswordAscii, false],
      );
      await type(commander.packPassword, 'secret');
      await click(commander.splitVolumes);
      await type(commander.volumeSize, '10 KB');
      assert.strictEqual(problem(), commander.volumeSmall);
      await type(commander.volumeSize, 'big');
      assert.strictEqual(problem(), commander.volumeUnread);
      await type(commander.volumeSize, '1 GB');
      assert.deepStrictEqual([problem(), packable()], [undefined, true]);
    });
  });
});
