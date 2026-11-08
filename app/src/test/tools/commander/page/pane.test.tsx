import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { act } from 'react';
import { renderToStaticMarkup as markupOf } from 'react-dom/server';
import {
  driveOf,
  ExtensionCell,
  layoutMenu,
  NameCell,
  Pane,
  RowIcon,
} from '../../../../tools/commander/page/pane';
import {
  flatRowOf,
  parentRow,
  rowsOf,
} from '../../../../tools/commander/page/listing';
import type { FlatProgress } from '../../../../tools/commander/shared/protocol';
import {
  emptyView,
  type PaneView,
} from '../../../../tools/commander/page/view';
import {
  CommanderStore,
  createCommanderStore,
} from '../../../../tools/commander/page/store';
import { strings } from '../../../../shared/strings';
import { noop } from '../../../fixtures';
import { shareOf, sideToFocus } from '../../../../tools/commander/page/tool';
import { JSDOM } from 'jsdom';
import { withStores } from '../../../componentFixtures';
const renderToStaticMarkup = (node: React.ReactNode) =>
  markupOf(withStores(node));

const pane = (elevated: boolean, hidden: readonly boolean[]): PaneView => ({
  folder: 'C:\\Config.Msi',
  hidden,
  entries: [],
  parent: true,
  back: false,
  forward: false,
  elevated,
  sort: { column: 'extension', descending: false, groupByColor: false },
  rows: [],
  selected: undefined,
  marked: new Set(),
  repositories: new Set(),
});
const header = (elevated: boolean, hidden: readonly boolean[] = []) =>
  /<span class="column-name path-title">(.*?)<\/span><div class="column-actions">/.exec(
    renderToStaticMarkup(
      <CommanderStore
        value={createCommanderStore(noop, {
          view: {
            ...emptyView,
            tab: '1',
            active: 'left',
            panes: { left: pane(elevated, hidden), right: undefined },
          },
        })}
      >
        <Pane
          side="left"
          driveTrigger={null}
          bookmarkTrigger={null}
          resizer={null}
        />
      </CommanderStore>,
    ),
  )?.[1];
const bookmarkStar = (bookmarks: readonly string[], platform: string) =>
  new JSDOM(
    renderToStaticMarkup(
      <CommanderStore
        value={createCommanderStore(noop, {
          view: {
            ...emptyView,
            tab: '1',
            active: 'left',
            platform,
            bookmarks,
            panes: { left: pane(false, []), right: undefined },
          },
        })}
      >
        <Pane
          side="left"
          driveTrigger={null}
          bookmarkTrigger={null}
          resizer={null}
        />
      </CommanderStore>,
    ),
  ).window.document
    .querySelector(
      `button[title="${strings.commander.bookmarks}"] .bookmark-icon`,
    )
    ?.getAttribute('class');

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

  test('lists the layouts and, past a line, grouping by color, checked while the side groups by it, and only while there are colors to group by', () => {
    const chosen: string[] = [];
    const items = layoutMenu({
      layout: 'thumbnails',
      groupByColor: true,
      canGroupByColor: true,
      onLayout: (layout) => chosen.push(layout),
      onGroupByColor: () => chosen.push('grouped'),
    });
    assert.deepStrictEqual(
      items.map((item) =>
        'separator' in item
          ? '---'
          : [item.label, item.checked ?? false, item.disabled ?? false],
      ),
      [
        [strings.commander.layouts.details, false, false],
        [strings.commander.layouts.thumbnails, true, false],
        '---',
        [strings.commander.groupByColor, true, false],
      ],
    );
    for (const item of items) {
      if (!('separator' in item)) {
        item.onClick?.();
      }
    }
    assert.deepStrictEqual(chosen, ['details', 'thumbnails', 'grouped']);

    const none = layoutMenu({
      layout: 'details',
      groupByColor: false,
      canGroupByColor: false,
      onLayout: noop,
      onGroupByColor: noop,
    }).at(-1);
    assert.ok(none !== undefined && !('separator' in none));
    assert.deepStrictEqual([none.checked, none.disabled], [false, true]);
  });

  test('shows the drive a folder is on, whatever the case of its letter', () => {
    const drives = ['C:\\', 'D:\\'];
    assert.strictEqual(driveOf('C:\\', drives), 'C:\\');
    assert.strictEqual(driveOf('d:\\backup\\2026', drives), 'D:\\');
    assert.strictEqual(driveOf('\\\\server\\share', drives), undefined);
    assert.strictEqual(driveOf('/home', []), undefined);
  });

  test('focuses the list of the side made active, unless the focus is in that side already, as in its drive menu', () => {
    const { document } = new JSDOM(
      '<section><button class="drive"></button><div data-column-focus tabindex="0"></div></section><button class="elsewhere"></button>',
    ).window;
    const column = document.querySelector('section') ?? undefined;
    const list = document.querySelector('[data-column-focus]');
    assert.strictEqual(
      sideToFocus(column, document.querySelector('.elsewhere')),
      list,
    );
    assert.strictEqual(sideToFocus(column, null), list);
    assert.strictEqual(
      sideToFocus(column, document.querySelector('.drive')),
      undefined,
    );
    assert.strictEqual(sideToFocus(undefined, null), undefined);
  });

  test('fills the star of the bookmarks of a side once its folder is bookmarked, whatever the case of its letters on Windows, and outlines it otherwise', () => {
    assert.strictEqual(
      bookmarkStar(['C:\\config.msi'], 'win32'),
      'icon bookmark-icon filled',
    );
    assert.strictEqual(
      bookmarkStar(['C:\\config.msi'], 'linux'),
      'icon bookmark-icon',
    );
    assert.strictEqual(bookmarkStar([], 'win32'), 'icon bookmark-icon');
  });

  test('marks a folder read as administrator before its path, and no other', () => {
    assert.match(
      header(true) ?? '',
      new RegExp(
        `^<span class="elevated-mark" title="${strings.commander.readAsAdministrator}">.*<span class="path-folder">`,
      ),
    );
    assert.match(header(false) ?? '', /^<span class="path-folder">/);
  });

  test('dims each hidden folder of its path, as its row is, and no other', () => {
    assert.strictEqual(
      header(false, [false, true]),
      '<span class="path-folder"><span class="path-part">C:\\</span></span><span class="path-name hidden">Config.Msi</span>',
    );
    assert.strictEqual(
      header(false),
      '<span class="path-folder"><span class="path-part">C:\\</span></span><span class="path-name">Config.Msi</span>',
    );
  });

  test('splits the sides where the divider is dragged, leaving each some room, and evenly before it is laid out', () => {
    assert.strictEqual(shareOf(300, 1000), 0.3);
    assert.strictEqual(shareOf(10, 1000), 0.15);
    assert.strictEqual(shareOf(990, 1000), 0.85);
    assert.strictEqual(shareOf(10, 0), 0.5);
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

const progress = (extra: Partial<FlatProgress> = {}): FlatProgress => ({
  reading: false,
  stopped: false,
  folders: 2,
  failed: 0,
  ...extra,
});

const side = (
  folder: string,
  flat: FlatProgress | undefined,
  selected?: string,
) => {
  const view: PaneView = {
    ...pane(false, []),
    folder,
    selected,
    rows: [
      parentRow,
      flatRowOf(file('a.txt'), ''),
      flatRowOf(file('b.txt'), 'sub\\'),
    ],
    ...(flat !== undefined && {
      flat: { walk: 1, progress: flat, shown: undefined },
    }),
  };
  return new JSDOM(
    renderToStaticMarkup(
      <CommanderStore
        value={createCommanderStore(noop, {
          view: {
            ...emptyView,
            tab: '1',
            active: 'left',
            panes: { left: view, right: undefined },
          },
        })}
      >
        <Pane
          side="left"
          driveTrigger={null}
          bookmarkTrigger={null}
          resizer={null}
        />
      </CommanderStore>,
    ),
  ).window.document;
};

const button = (document: Document) =>
  document.querySelector(`button[title="${strings.commander.flatView}"]`);

const status = (document: Document) => ({
  text: document.querySelector('.column-status-text')?.textContent,
  end: document.querySelector('.column-status-end')?.textContent,
  tone: document.querySelector('.column-status')?.className,
  role: document.querySelector('.column-status-text')?.getAttribute('role'),
});

const cell = (row: ReturnType<typeof flatRowOf>, words: string[]) =>
  new JSDOM(renderToStaticMarkup(<NameCell row={row} words={words} />)).window
    .document;

const end = (selected: string) =>
  side('C:\\a', progress(), selected).querySelector('.column-status-end')
    ?.textContent;

suite('Commander pane in flat view', () => {
  test('ends the path of a flat side in ** past a separator, and presses the button of flat view, turning it while reading', () => {
    const reading = side('C:\\Downloads', progress({ reading: true }));
    const read = side('C:\\', progress());
    const plain = side('C:\\Downloads', undefined);

    assert.strictEqual(
      reading.querySelector('.path-title')?.textContent,
      'C:\\Downloads\\**',
    );
    assert.strictEqual(
      reading.querySelector('.path-flat')?.textContent,
      '\\**',
    );
    assert.strictEqual(read.querySelector('.path-flat')?.textContent, '**');
    assert.strictEqual(plain.querySelector('.path-flat'), null);
    assert.strictEqual(button(reading)?.getAttribute('aria-pressed'), 'true');
    assert.strictEqual(
      button(reading)?.className,
      'nav-button toggle active running',
    );
    assert.strictEqual(button(read)?.className, 'nav-button toggle active');
    assert.strictEqual(button(plain)?.getAttribute('aria-pressed'), 'false');
    assert.strictEqual(button(plain)?.className, 'nav-button toggle');
  });

  test('puts the button of flat view between the layout and the filter', () => {
    const document = side('C:\\Downloads', undefined);
    assert.deepStrictEqual(
      Array.from(
        document.querySelector('.column-actions')?.children ?? [],
        (child) => child.className,
      ),
      ['commander-layout', 'nav-button toggle', 'nav-button search-button'],
    );
  });

  test('says under a flat side how many files it read in how many folders, that Esc stops it while reading, and what could not be read', () => {
    assert.deepStrictEqual(
      status(side('C:\\a', progress({ reading: true, folders: 1 }))),
      {
        text: `${strings.commander.flatReading(2, 1)} · ${strings.commander.escapeStops}`,
        end: undefined,
        tone: 'column-status',
        role: 'status',
      },
    );
    assert.deepStrictEqual(status(side('C:\\a', progress({ failed: 3 }))), {
      text: `${strings.commander.flatRead(2, 2)} · ${strings.commander.flatFailed(3)}`,
      end: undefined,
      tone: 'column-status',
      role: 'status',
    });
    assert.deepStrictEqual(status(side('C:\\a', progress({ stopped: true }))), {
      text: strings.commander.flatStopped(2, 2),
      end: undefined,
      tone: 'column-status warning',
      role: 'status',
    });
    assert.strictEqual(
      side('C:\\a', undefined).querySelector('.column-status'),
      null,
    );
  });

  test('ends the line under a flat side with the folder the selected file is in, and nothing for a file in the folder of the side', () => {
    assert.strictEqual(end('sub\\b.txt'), 'sub');
    assert.strictEqual(end('a.txt'), undefined);
    assert.strictEqual(end('..'), undefined);
  });

  test('shows the name of a file under the side without the folder it is in, so the names line up', () => {
    const nested = cell(flatRowOf(file('notes.txt'), 'docs\\old\\'), ['o']);

    assert.strictEqual(
      nested.querySelector('.commander-name')?.textContent,
      'notes',
    );
    assert.strictEqual(nested.querySelectorAll('mark').length, 1);
  });
});
