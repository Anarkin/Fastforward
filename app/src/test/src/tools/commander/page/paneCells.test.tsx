import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { act } from 'react';
import { renderToStaticMarkup as markupOf } from 'react-dom/server';
import { flatRowOf, rowsOf } from '../../../../../tools/commander/page/listing';
import type { Entry } from '../../../../../tools/commander/shared/protocol';
import { strings } from '../../../../../lib/shared/strings';
import { noop } from '../../../../helpers/fixtures';
import { JSDOM } from 'jsdom';
import { withStores } from '../../../../helpers/componentFixtures';
import {
  ExtensionCell,
  NameCell,
  RowIcon,
  SizeCell,
} from '../../../../../tools/commander/page/paneCells';

const renderToStaticMarkup = (node: React.ReactNode) =>
  markupOf(withStores(node));

suite('Commander pane', () => {
  test('hands back the ticket of an icon whose row goes before the icon comes, and none of one that came or failed', async () => {
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
      const dropped: string[] = [];
      const names = ['waiting.exe', 'came.exe', 'failed.exe'];
      const rows = rowsOf(
        names.map((name) => ({
          name,
          folder: false,
          link: false,
          hidden: false,
          size: 1,
          modified: 0,
        })),
        false,
        true,
        { column: 'name', descending: false, groupByColor: false },
      );
      await act(async () => {
        root.render(
          <>
            {rows.map((row) => (
              <RowIcon
                key={row.key}
                row={row}
                source={{
                  tab: '1',
                  side: 'left',
                  folder: '/work',
                  name: row.key,
                }}
                onDropIcon={(ticket) => dropped.push(ticket)}
              />
            ))}
          </>,
        );
      });
      const images = [...main.querySelectorAll('img')];
      const tickets = images.map((image) =>
        new URL(
          image.getAttribute('src') ?? '',
          'fastforward://app',
        ).searchParams.get('ticket'),
      );
      assert.strictEqual(new Set(tickets).size, 3);
      const named = (name: string) =>
        images.find((image) => image.getAttribute('src')?.includes(name));
      await act(async () => {
        named('came')?.dispatchEvent(new dom.window.Event('load'));
        named('failed')?.dispatchEvent(new dom.window.Event('error'));
      });
      await act(async () => {
        root.unmount();
      });
      assert.deepStrictEqual(dropped, [
        tickets[images.indexOf(named('waiting') ?? images[0])],
      ]);
    } finally {
      Object.assign(globalThis, saved);
    }
  });

  test('tries the icon of a file again once its row shows a file of the same name in another folder, after the icon of the first failed', async () => {
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
      const [row] = rowsOf(
        [
          {
            name: 'tool.exe',
            folder: false,
            link: false,
            hidden: false,
            size: 1,
            modified: 0,
          },
        ],
        false,
        true,
        { column: 'name', descending: false, groupByColor: false },
      );
      assert.ok(row);
      const show = (folder: string) =>
        act(async () => {
          root.render(
            <RowIcon
              row={row}
              source={{ tab: '1', side: 'left', folder, name: row.key }}
              onDropIcon={noop}
            />,
          );
        });
      await show('/first');
      await act(async () => {
        main.querySelector('img')?.dispatchEvent(new dom.window.Event('error'));
      });
      assert.strictEqual(main.querySelector('img'), null);
      await show('/second');
      assert.ok(main.querySelector('img'));
      await act(async () => {
        root.unmount();
      });
    } finally {
      Object.assign(globalThis, saved);
    }
  });

  test('shows the generic file icon at once for an icon that has not come yet, until it comes', async () => {
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
      const rows = rowsOf(
        ['slow.exe', 'fast.exe'].map((name) => ({
          name,
          folder: false,
          link: false,
          hidden: false,
          size: 1,
          modified: 0,
        })),
        false,
        true,
        { column: 'name', descending: false, groupByColor: false },
      );
      await act(async () => {
        root.render(
          <>
            {rows.map((row) => (
              <span key={row.key} data-name={row.key}>
                <RowIcon
                  row={row}
                  source={{
                    tab: '1',
                    side: 'left',
                    folder: '/work',
                    name: row.key,
                  }}
                  onDropIcon={noop}
                />
              </span>
            ))}
          </>,
        );
      });
      const looks = (name: string) => {
        const icon = main.querySelector(`[data-name="${name}"]`);
        return {
          generic: icon?.querySelector('svg') !== null,
          loading: icon?.querySelector('img')?.classList.contains('loading'),
        };
      };
      assert.deepStrictEqual(looks('slow.exe'), {
        generic: true,
        loading: true,
      });
      await act(async () => {
        main
          .querySelector('[data-name="fast.exe"] img')
          ?.dispatchEvent(new dom.window.Event('load'));
      });
      assert.deepStrictEqual(looks('fast.exe'), {
        generic: false,
        loading: false,
      });
      assert.deepStrictEqual(looks('slow.exe'), {
        generic: true,
        loading: true,
      });
      await act(async () => {
        main
          .querySelector('[data-name="slow.exe"] img')
          ?.dispatchEvent(new dom.window.Event('load'));
      });
      assert.deepStrictEqual(looks('slow.exe'), {
        generic: false,
        loading: false,
      });
      await act(async () => {
        root.unmount();
      });
    } finally {
      Object.assign(globalThis, saved);
    }
  });

  test('shows the extension of a file, and the git icon of a folder that is a repository as a button opening it in a git tab', () => {
    const rows = rowsOf(
      [
        {
          name: 'docs',
          folder: true,
          link: false,
          hidden: false,
          size: undefined,
          modified: 0,
        },
        {
          name: 'app',
          folder: true,
          link: false,
          hidden: false,
          size: undefined,
          modified: 0,
        },
        {
          name: 'notes.txt',
          folder: false,
          link: false,
          hidden: false,
          size: 1,
          modified: 0,
        },
      ],
      true,
      true,
      { column: 'extension', descending: false, groupByColor: false },
      new Set(['app']),
    );
    const [parent, plain, repository, file] = [
      '..',
      'docs',
      'app',
      'notes.txt',
    ].map((key) => rows.find((row) => row.key === key) ?? rows[0]);
    const cell = (row: typeof parent) =>
      renderToStaticMarkup(
        <ExtensionCell row={row} words={[]} onOpenRepository={noop} />,
      );

    assert.strictEqual(
      cell(parent),
      '<span class="commander-extension"></span>',
    );
    assert.strictEqual(
      cell(plain),
      '<span class="commander-extension"></span>',
    );
    assert.match(
      cell(repository),
      new RegExp(
        `^<span class="commander-extension"><button class="commander-mark" title="${strings.commander.openRepository}" tabindex="-1"><svg class="icon tool-icon tool-git"`,
      ),
    );
    assert.match(
      cell(file),
      /^<span class="commander-extension">.*txt.*<\/span>$/,
    );
  });
});

const file = (name: string) => ({
  name,
  folder: false,
  link: false,
  hidden: false,
  size: 1,
  modified: 0,
});

const cell = (row: ReturnType<typeof flatRowOf>, words: string[]) =>
  new JSDOM(renderToStaticMarkup(<NameCell row={row} words={words} />)).window
    .document;

suite('Commander pane in flat view', () => {
  test('shows the name of a file under the side without the folder it is in, so the names line up', () => {
    const nested = cell(flatRowOf(file('notes.txt'), 'docs\\old\\'), ['o']);

    assert.strictEqual(
      nested.querySelector('.commander-name')?.textContent,
      'notes',
    );
    assert.strictEqual(nested.querySelectorAll('mark').length, 1);
  });
});

const sized = (extra: Partial<Entry>): Entry => ({
  name: 'photos',
  folder: true,
  link: false,
  hidden: false,
  size: 1234,
  modified: 0,
  ...extra,
});

const sizeCell = (entry: Entry | undefined, tile = false) =>
  renderToStaticMarkup(<SizeCell entry={entry} tile={tile} />);

suite('Commander pane counting the sizes of folders', () => {
  test('shows the size of a folder dimmed while it is counted, saying how many folders under it could not be read, and none of a folder not counted or the parent', () => {
    assert.strictEqual(
      sizeCell(sized({ counting: true })),
      '<span class="commander-size counting">1,234</span>',
    );
    const unread = new JSDOM(sizeCell(sized({ unreadFolders: 2 }))).window
      .document.body.firstElementChild;
    assert.deepStrictEqual(
      [unread?.className, unread?.getAttribute('title'), unread?.textContent],
      ['commander-size', strings.commander.unreadUnder(2), '1,234'],
    );
    assert.strictEqual(
      sizeCell(sized({ counting: true }), true),
      '<div class="commander-tile-size counting">1,234</div>',
    );
    assert.strictEqual(
      sizeCell(sized({ size: undefined })),
      '<span class="commander-size"></span>',
    );
    assert.strictEqual(
      sizeCell(undefined),
      '<span class="commander-size"></span>',
    );
  });
});
