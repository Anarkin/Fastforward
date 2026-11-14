import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test, vi } from 'vitest';
import { strings } from '../../../../../lib/shared/strings';
import { createShellStore } from '../../../../../shell/page/store';
import { Pane } from '../../../../../tools/commander/page/pane';
import { rowsOf } from '../../../../../tools/commander/page/listing';
import {
  emptyView,
  type PaneView,
} from '../../../../../tools/commander/page/view';
import { createCommanderStore } from '../../../../../tools/commander/page/store';
import type { CommanderToHost } from '../../../../../tools/commander/shared/protocol';
import type { ToHost } from '../../../../../shell/shared/protocol';
import type { Layout } from '../../../../../tools/commander/shared/settings';
import { withStores } from '../../../../helpers/componentFixtures';
import { noop } from '../../../../helpers/fixtures';

vi.mock('../../../../../lib/page/virtualRows', async (importOriginal) => {
  const { createElement, Fragment } = await import('react');
  const { columnFocusAttribute } =
    await import('../../../../../lib/page/columnFocus.js');
  return {
    ...(await importOriginal<
      typeof import('../../../../../lib/page/virtualRows')
    >()),
    VirtualRows: ({
      rows,
      renderRow,
    }: {
      rows: { readonly count: number };
      renderRow: (index: number) => React.ReactNode;
    }) =>
      createElement(
        'div',
        { [columnFocusAttribute]: '', tabIndex: 0 },
        Array.from({ length: rows.count }, (_, index) =>
          createElement(Fragment, { key: index }, renderRow(index)),
        ),
      ),
  };
});

const sort = {
  column: 'name',
  descending: false,
  groupByColor: false,
} as const;

function workPane(): PaneView {
  const entries = [
    { name: 'app', folder: true },
    { name: 'docs', folder: true },
    { name: 'notes.txt', folder: false },
  ].map((each) => ({
    ...each,
    link: false,
    hidden: false,
    size: 1,
    modified: 0,
  }));
  const repositories = new Set(['app']);
  return {
    folder: '/work',
    hidden: [],
    entries,
    parent: true,
    back: false,
    forward: false,
    elevated: false,
    sort,
    rows: rowsOf(entries, true, true, sort, repositories),
    selected: 'notes.txt',
    marked: new Set(),
    repositories,
    counting: 0,
  };
}

async function inPane(
  run: (shown: {
    readonly main: HTMLElement;
    readonly rightClick: (target: Element | null, shift?: boolean) => void;
    readonly click: (target: Element | null, count: number) => void;
    readonly menu: () => readonly string[];
    readonly choose: (label: string) => void;
    readonly posted: CommanderToHost[];
    readonly copied: () => readonly string[];
    readonly goingTo: () => string | undefined;
    readonly selected: () => string | undefined;
    readonly marked: () => readonly string[];
  }) => Promise<void>,
  layout: Layout = 'details',
  shownPane: PaneView = workPane(),
) {
  const dom = new JSDOM('<!doctype html><main></main>');
  dom.window.matchMedia = () =>
    Object.assign(new dom.window.EventTarget(), {
      matches: false,
      media: '',
      onchange: null,
      addListener: noop,
      removeListener: noop,
    });
  const globals = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    matchMedia: dom.window.matchMedia,
    devicePixelRatio: 1,
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
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientWidth', {
    get: () => 800,
  });
  try {
    const { createRoot } = await import('react-dom/client');
    const main = dom.window.document.querySelector('main');
    assert.ok(main);
    const root = createRoot(main);
    const posted: CommanderToHost[] = [];
    const commander = createCommanderStore((message) => posted.push(message), {
      drives: ['C:\\', 'D:\\'],
      view: {
        ...emptyView,
        tab: '1',
        active: 'left',
        platform: 'win32',
        bookmarks: ['/work/docs'],
        layouts: { left: layout, right: 'details' },
        panes: { left: shownPane, right: undefined },
      },
    });
    const shellPosted: ToHost[] = [];
    const shell = createShellStore((message) => shellPosted.push(message));
    await act(async () => {
      root.render(
        withStores(
          <Pane
            side="left"
            driveTrigger={null}
            bookmarkTrigger={null}
            resizer={null}
          />,
          { shell, commander },
        ),
      );
    });
    const items = () =>
      (shell.getState().menu?.menu.items ?? []).flatMap((item) =>
        'separator' in item ? [] : [item],
      );
    await run({
      main,
      rightClick: (target, shift = false) => {
        assert.ok(target);
        act(() => {
          target.dispatchEvent(
            new dom.window.MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              button: 2,
              clientX: 10,
              clientY: 20,
              shiftKey: shift,
            }),
          );
        });
      },
      click: (target, count) => {
        assert.ok(target);
        act(() => {
          for (const type of count === 2 ? ['click', 'dblclick'] : ['click']) {
            target.dispatchEvent(
              new dom.window.MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                detail: count,
              }),
            );
          }
        });
      },
      menu: () => items().map((item) => item.label),
      choose: (label) => {
        const item = items().find((each) => each.label === label);
        assert.ok(item, label);
        act(() => item.onClick?.());
      },
      posted,
      copied: () =>
        shellPosted.flatMap((message) =>
          message.type === 'copyText' ? [message.text] : [],
        ),
      goingTo: () => commander.getState().goingTo?.folder,
      selected: () => commander.getState().view.panes.left?.selected,
      marked: () => [...(commander.getState().view.panes.left?.marked ?? [])],
    });
    await act(async () => root.unmount());
  } finally {
    Object.assign(globalThis, saved);
  }
}

const rowNamed = (main: HTMLElement, name: string) =>
  [...main.querySelectorAll('.commander-row')].find(
    (row) => row.querySelector('.commander-name')?.textContent === name,
  ) ?? null;

const tileNamed = (main: HTMLElement, name: string) =>
  [...main.querySelectorAll('.commander-tile')].find(
    (tile) => tile.querySelector('.commander-tile-base')?.textContent === name,
  ) ?? null;

const boxOf = (item: Element | null) =>
  item?.querySelector('.commander-check') ?? null;

const shownFolderMenu = [
  strings.commander.newTerminalHere,
  strings.commander.cloneHere,
  strings.commander.initHere,
  strings.commander.copyPath,
  strings.commander.copyName,
  strings.commander.goToItem,
  strings.commander.showMoreOptions,
];

function duplicatesPane(
  duplicates: PaneView['duplicates'] = {
    look: 1,
    groups: [['notes.txt', 'copy.txt']],
    reading: false,
  },
): PaneView {
  const entries = ['copy.txt', 'notes.txt', 'other.txt'].map((name) => ({
    name,
    folder: false,
    link: false,
    hidden: false,
    size: 1,
    modified: 0,
  }));
  return {
    ...workPane(),
    entries,
    rows: rowsOf(entries, true, true, sort),
    duplicates,
  };
}

const statusOf = (duplicates: PaneView['duplicates']) => {
  let status: string | null | undefined;
  return inPane(
    async ({ main }) => {
      status = main.querySelector('.column-status')?.textContent;
    },
    'details',
    duplicatesPane(duplicates),
  ).then(() => status);
};

suite('Commander side showing duplicates', () => {
  test('says under the side that it looks for duplicates while it reads, that Esc stops it, and that it found none once done without any, and nothing once it found some', async () => {
    assert.deepStrictEqual(
      [
        await statusOf({ look: 1, groups: [], reading: true }),
        await statusOf({ look: 1, groups: [], reading: false }),
        await statusOf(undefined),
        await statusOf({
          look: 1,
          groups: [['notes.txt', 'copy.txt']],
          reading: false,
        }),
      ],
      [
        `${strings.commander.findingDuplicates} · ${strings.commander.escapeStops}`,
        strings.commander.noDuplicates,
        undefined,
        undefined,
      ],
    );
  });

  test('shows only the files that have a copy, a line above the first file of each group, and says so after its path', async () => {
    await inPane(
      async ({ main }) => {
        const rows = [...main.querySelectorAll('.commander-row')].map((row) => [
          row.querySelector('.commander-name')?.textContent,
          row.classList.contains('group-start'),
        ]);

        assert.deepStrictEqual(rows, [
          ['..', false],
          ['copy', true],
          ['notes', false],
        ]);
        assert.strictEqual(
          main.querySelector('.commander-path .path-duplicates')?.textContent,
          strings.commander.duplicatesTag,
        );
      },
      'details',
      duplicatesPane(),
    );
  });
});

suite('Commander menu on a side', () => {
  test('hands the focus to the list of the side once a drive, a bookmark or a layout is chosen from the menus of its header, so its keys work at once', async () => {
    await inPane(async ({ main }) => {
      const chosenFrom = async (title: string, label: string) => {
        const trigger = main.querySelector<HTMLButtonElement>(
          `button[title="${title}"]`,
        );
        assert.ok(trigger, title);
        await act(async () => trigger.focus());
        await act(async () => trigger.click());
        const item = [
          ...main.querySelectorAll<HTMLButtonElement>('.menu-item'),
        ].find((each) => each.textContent.endsWith(label));
        assert.ok(item, label);
        await act(async () => item.click());
        return Boolean(
          main.ownerDocument.activeElement?.closest('.column-body'),
        );
      };

      assert.deepStrictEqual(
        [
          await chosenFrom(strings.commander.chooseDrive, 'D:\\'),
          await chosenFrom(strings.commander.bookmarks, '/work/docs'),
          await chosenFrom(
            strings.commander.layout,
            strings.commander.layouts.details,
          ),
        ],
        [true, true, true],
      );
    });
  });

  test('opens the menu of the folder shown on a right click on its path, copying its path or name as text, or asking for a path to go to', async () => {
    await inPane(
      async ({ main, rightClick, menu, choose, copied, goingTo }) => {
        rightClick(main.querySelector('.commander-path .path-name'));
        assert.deepStrictEqual(menu(), shownFolderMenu);
        choose(strings.commander.copyPath);
        rightClick(main.querySelector('.commander-path'));
        choose(strings.commander.copyName);
        rightClick(rowNamed(main, 'notes'));
        choose(strings.commander.copyName);
        rightClick(main.querySelector('.commander-path'));
        choose(strings.commander.goToItem);

        assert.deepStrictEqual(copied(), ['/work', 'work', 'notes.txt']);
        assert.strictEqual(goingTo(), '/work');
      },
    );
  });

  test('opens the menu of the folder shown on a right click on .. or on the empty space, asking for its commands without naming a folder', async () => {
    await inPane(async ({ main, rightClick, menu, choose, posted }) => {
      rightClick(main.querySelector('.commander-row'));
      assert.deepStrictEqual(menu(), shownFolderMenu);
      choose(strings.commander.newTerminalHere);

      rightClick(main.querySelector('.column-body'));
      assert.deepStrictEqual(menu(), shownFolderMenu);
      choose(strings.commander.showMoreOptions);

      assert.deepStrictEqual(posted, [
        {
          type: 'folderCommand',
          tab: '1',
          side: 'left',
          folder: '/work',
          command: 'newTerminal',
        },
        {
          type: 'shellMenu',
          tab: '1',
          side: 'left',
          folder: '/work',
          names: [],
          x: 10,
          y: 20,
          extended: false,
        },
      ]);
    });
  });

  test('opens the menu of a folder or file clicked, selecting it, a repository offered to open in git', async () => {
    await inPane(
      async ({ main, rightClick, menu, choose, posted, selected }) => {
        rightClick(rowNamed(main, 'app'));
        assert.strictEqual(selected(), 'app');
        assert.deepStrictEqual(menu(), [
          strings.commander.newTerminalHere,
          strings.commander.openInGit,
          strings.commander.copyPath,
          strings.commander.copyName,
          strings.commander.showMoreOptions,
        ]);
        choose(strings.commander.openInGit);

        rightClick(rowNamed(main, 'notes'));
        assert.strictEqual(selected(), 'notes.txt');
        assert.deepStrictEqual(menu(), [
          strings.commander.openWithSevenZip,
          strings.commander.copyPath,
          strings.commander.copyName,
          strings.commander.showMoreOptions,
        ]);

        assert.deepStrictEqual(posted, [
          {
            type: 'folderCommand',
            tab: '1',
            side: 'left',
            folder: '/work',
            name: 'app',
            command: 'openInGit',
          },
        ]);
      },
    );
  });

  test('shows the extended menu of Windows straight away on Shift and a right click, of the folder shown on the empty space', async () => {
    await inPane(async ({ main, rightClick, menu, posted }) => {
      rightClick(rowNamed(main, 'notes'), true);
      rightClick(main.querySelector('.column-body'), true);

      assert.deepStrictEqual(menu(), []);
      assert.deepStrictEqual(
        posted.map((message) =>
          message.type === 'shellMenu'
            ? `${message.names.join()} ${message.extended}`
            : message.type,
        ),
        ['notes.txt true', ' true'],
      );
    });
  });
});

suite('Commander clicks on a side', () => {
  test('opens what is double clicked, a double click right after another at the same spot too, as Chromium counts those clicks on from 3 and sends no dblclick', async () => {
    await inPane(async ({ main, click, posted }) => {
      click(rowNamed(main, 'docs'), 1);
      click(rowNamed(main, 'docs'), 2);
      click(rowNamed(main, 'notes'), 3);
      click(rowNamed(main, 'notes'), 3);

      assert.deepStrictEqual(
        posted.flatMap((message) =>
          message.type === 'open' ? [message.name] : [],
        ),
        ['docs', 'notes.txt'],
      );
    });
  });
  test('marks a folder or a file on a click on its box and unmarks it on the next, a double click on it only toggling it, leaving the selection where it was and opening nothing, the parent folder having no box', async () => {
    await inPane(async ({ main, click, posted, selected, marked }) => {
      assert.ok(rowNamed(main, '..'));
      assert.strictEqual(boxOf(rowNamed(main, '..')), null);

      click(boxOf(rowNamed(main, 'docs')), 1);
      click(boxOf(rowNamed(main, 'app')), 1);
      assert.deepStrictEqual(marked().toSorted(), ['app', 'docs']);
      assert.strictEqual(selected(), 'notes.txt');

      click(boxOf(rowNamed(main, 'docs')), 2);
      assert.deepStrictEqual(marked(), ['app']);
      assert.strictEqual(selected(), 'notes.txt');
      assert.deepStrictEqual(
        posted.filter((message) => message.type === 'open'),
        [],
      );
    });
  });

  test('marks a thumbnail on a click on its box and unmarks it on the next, leaving the selection where it was, the parent folder having no box', async () => {
    await inPane(async ({ main, click, selected, marked }) => {
      assert.ok(tileNamed(main, '..'));
      assert.strictEqual(boxOf(tileNamed(main, '..')), null);

      click(boxOf(tileNamed(main, 'docs')), 1);
      assert.deepStrictEqual(marked(), ['docs']);
      assert.strictEqual(selected(), 'notes.txt');

      click(boxOf(tileNamed(main, 'docs')), 1);
      assert.deepStrictEqual(marked(), []);
    }, 'thumbnails');
  });
});
