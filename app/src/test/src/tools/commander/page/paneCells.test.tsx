import * as assert from 'node:assert';
import { suite, test, vi } from 'vitest';
import { plainFilter } from '../../../../helpers/filters';
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
import {
  iconWait,
  whenStayed,
} from '../../../../../tools/commander/page/iconAsks';

const stayed = () =>
  act(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, iconWait + 30);
      }),
  );

const later = (time: number) =>
  act(async () => {
    vi.advanceTimersByTime(time);
  });

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
      await stayed();
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

  test('asks for the icon of a file only once its row has stayed a moment, showing the generic one meanwhile, so a row a list glides or pages past asks for none and has none to hand back, as each row of a folder of programs asked for its own icon and handed it back at every step, a fifth of the frames of a glide coming late', async () => {
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
      const drawn = () => (
        <RowIcon
          row={row}
          source={{ tab: '1', side: 'left', folder: '/work', name: row.key }}
          onDropIcon={(ticket) => dropped.push(ticket)}
        />
      );
      const shows = () => ({
        asked: main.querySelector('img') !== null,
        generic: main.querySelector('.file-icon') !== null,
      });
      await act(async () => root.render(drawn()));
      const passing = shows();
      await act(async () => root.render(<></>));
      const passed = [...dropped];
      await act(async () => root.render(drawn()));
      await stayed();
      const staying = shows();
      await act(async () => root.unmount());

      assert.deepStrictEqual(
        { passing, passed, staying, dropped: dropped.length },
        {
          passing: { asked: false, generic: true },
          passed: [],
          staying: { asked: true, generic: true },
          dropped: 1,
        },
      );
    } finally {
      Object.assign(globalThis, saved);
    }
  });

  test('asks for the icons only once the list has rested as long, however long their rows have stayed, as the rows of a list scrolled by the wheel stay longer than a moment and each asked for its icon while the list still moved', async () => {
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
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
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
      const asked = () => main.querySelector('img') !== null;
      await act(async () =>
        root.render(
          <RowIcon
            row={row}
            source={{ tab: '1', side: 'left', folder: '/work', name: row.key }}
            onDropIcon={noop}
          />,
        ),
      );
      const seen: boolean[] = [];
      for (let scroll = 0; scroll < 4; scroll++) {
        await later(iconWait * 0.6);
        main.dispatchEvent(new dom.window.Event('scroll'));
        seen.push(asked());
      }
      await later(iconWait * 0.6);
      seen.push(asked());
      await later(iconWait * 0.5);
      seen.push(asked());
      await act(async () => root.unmount());

      assert.deepStrictEqual(seen, [false, false, false, false, false, true]);
    } finally {
      vi.useRealTimers();
      Object.assign(globalThis, saved);
    }
  });

  test('draws the generic icon of a file or a folder as one element, an outline cut out of its color, rather than a drawing of three or four elements in every row, as a list scrolled by its scrollbar draws a screen of new rows at each step, each element of them styled, laid out and painted', () => {
    const [folder, file] = rowsOf(
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
          name: 'notes.txt',
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
    assert.ok(folder && file);
    assert.deepStrictEqual(
      [folder, file].map((row) =>
        renderToStaticMarkup(
          <RowIcon row={row} source={undefined} onDropIcon={noop} />,
        ),
      ),
      [
        '<span class="icon folder-icon" aria-hidden="true"></span>',
        '<span class="icon file-icon" aria-hidden="true"></span>',
      ],
    );
  });

  test('waits for every row on one timer between them, rather than on a timer a row set as it is drawn and cleared as it goes, as a list dragged by its scrollbar draws and drops a screen of rows at every step and their timers took two thirds of its script', () => {
    const dom = new JSDOM('<!doctype html><main></main>');
    const saved: unknown = Reflect.get(globalThis, 'document');
    Object.assign(globalThis, { document: dom.window.document });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    try {
      const set = vi.spyOn(globalThis, 'setTimeout');
      const cleared = vi.spyOn(globalThis, 'clearTimeout');
      const asked: number[] = [];
      const dropped = Array.from({ length: 40 }, (_, row) =>
        whenStayed(() => asked.push(row)),
      );
      dropped.slice(0, 30).forEach((drop) => drop());
      vi.advanceTimersByTime(iconWait * 2);

      assert.deepStrictEqual(
        asked,
        Array.from({ length: 10 }, (_, row) => 30 + row),
      );
      assert.ok(set.mock.calls.length <= 4, String(set.mock.calls.length));
      assert.strictEqual(cleared.mock.calls.length, 0);
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
      Object.assign(globalThis, { document: saved });
    }
  });

  test('looks at the page no more once every row that waited has gone, as the timer of rows gone looked for the page after it, where a test had taken its page away, and failed the run of a commit that changed none of it', () => {
    const dom = new JSDOM('<!doctype html><main></main>');
    const saved: unknown = Reflect.get(globalThis, 'document');
    Object.assign(globalThis, { document: dom.window.document });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    try {
      const asked: number[] = [];
      const drops = [1, 2, 3].map((row) => whenStayed(() => asked.push(row)));
      drops.forEach((drop) => drop());
      Object.assign(globalThis, { document: undefined });

      assert.doesNotThrow(() => vi.advanceTimersByTime(iconWait * 2));
      assert.deepStrictEqual(asked, []);
    } finally {
      vi.useRealTimers();
      Object.assign(globalThis, { document: saved });
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
      await stayed();
      await act(async () => {
        main.querySelector('img')?.dispatchEvent(new dom.window.Event('error'));
      });
      assert.strictEqual(main.querySelector('img'), null);
      await show('/second');
      await stayed();
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
      await stayed();
      const looks = (name: string) => {
        const icon = main.querySelector(`[data-name="${name}"]`);
        return {
          generic: icon?.querySelector('.file-icon') !== null,
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
    const cell = (row: typeof parent, columns = 5) =>
      renderToStaticMarkup(
        <ExtensionCell
          row={row}
          filter={plainFilter('')}
          columns={columns}
          onOpenRepository={noop}
        />,
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
        `^<span class="commander-extension cut"><button class="commander-mark" title="${strings.commander.openRepository}" tabindex="-1"><svg class="icon tool-icon tool-git"`,
      ),
    );
    assert.match(
      cell(file),
      /^<span class="commander-extension">.*txt.*<\/span>$/,
    );
    assert.match(
      cell(file, 2),
      /^<span class="commander-extension cut">.*txt.*<\/span>$/,
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
  new JSDOM(
    renderToStaticMarkup(
      <NameCell row={row} filter={plainFilter(words.join(' '))} />,
    ),
  ).window.document;

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

  test('asks for the icon of a file that came before by the address it came by once its row is drawn again, so the icon shows at once from the images the page holds, and drops no ticket of it', async () => {
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
      const tickets = new Map<string, string>();
      const icons = {
        iconTicketOf: (url: string) => tickets.get(url),
        iconCame: (url: string, ticket: string) => {
          tickets.set(url, ticket);
        },
      };
      const [row] = rowsOf(
        [
          {
            name: 'app.exe',
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
      const drawn = () => (
        <RowIcon
          row={row}
          source={{ tab: '1', side: 'left', folder: '/work', name: 'app.exe' }}
          onDropIcon={(ticket) => dropped.push(ticket)}
          tickets={icons}
        />
      );
      await act(async () => root.render(drawn()));
      await stayed();
      const first = main.querySelector('img')?.getAttribute('src');
      await act(async () => {
        main.querySelector('img')?.dispatchEvent(new dom.window.Event('load'));
      });
      await act(async () => root.render(<></>));
      await act(async () => root.render(drawn()));
      const image = main.querySelector('img');
      assert.strictEqual(image?.getAttribute('src'), first);
      assert.ok(!image?.classList.contains('loading'), 'shown at once');
      assert.strictEqual(main.querySelector('.file-icon'), null);
      await act(async () => root.unmount());
      assert.deepStrictEqual(dropped, []);
    } finally {
      Object.assign(globalThis, saved);
    }
  });
});
