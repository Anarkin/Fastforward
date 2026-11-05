import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  driveOf,
  ExtensionCell,
  layoutMenu,
  Pane,
  RowIcon,
} from '../../../../tools/commander/page/pane';
import { noFileColors } from '../../../../tools/commander/page/fileColors';
import { rowsOf } from '../../../../tools/commander/page/listing';
import type { PaneView } from '../../../../tools/commander/page/view';
import { strings } from '../../../../shared/strings';
import { noop } from '../../../fixtures';
import { shareOf, sideToFocus } from '../../../../tools/commander/page/tool';
import { JSDOM } from 'jsdom';

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
      <Pane
        tab="1"
        side="left"
        active
        pane={pane(elevated, hidden)}
        layout="details"
        thumbnailSize={144}
        fileColors={noFileColors}
        onLayout={noop}
        canGroupByColor
        onGroupByColor={noop}
        onDropIcon={noop}
        onThumbnail={noop}
        columns={{ extension: 10, size: 15, date: 16 }}
        drives={[]}
        driveTrigger={null}
        onSelect={noop}
        onMark={noop}
        onCompare={noop}
        onOpen={noop}
        onSort={noop}
        onActivate={noop}
        onSwitchSide={noop}
        onDrive={noop}
        onDrivesOpening={noop}
        onStep={noop}
        onOpenOnSide={noop}
        onOpenRepository={noop}
        onView={noop}
        onDelete={noop}
        onShellMenu={noop}
        onResize={noop}
        onResized={noop}
        onReset={noop}
        resizer={null}
      />,
    ),
  )?.[1];
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
