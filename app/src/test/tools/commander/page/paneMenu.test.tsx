import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test, vi } from 'vitest';
import { strings } from '../../../../shared/strings';
import { createShellStore } from '../../../../shell/page/store';
import { Pane } from '../../../../tools/commander/page/pane';
import { rowsOf } from '../../../../tools/commander/page/listing';
import {
  emptyView,
  type PaneView,
} from '../../../../tools/commander/page/view';
import { createCommanderStore } from '../../../../tools/commander/page/store';
import type { CommanderToHost } from '../../../../tools/commander/shared/protocol';
import { withStores } from '../../../componentFixtures';
import { noop } from '../../../fixtures';

vi.mock('../../../../ui/virtualRows', async (importOriginal) => {
  const { createElement, Fragment } = await import('react');
  return {
    ...(await importOriginal<typeof import('../../../../ui/virtualRows')>()),
    VirtualRows: ({
      rows,
      renderRow,
    }: {
      rows: { readonly count: number };
      renderRow: (index: number) => React.ReactNode;
    }) =>
      createElement(
        'div',
        null,
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
    readonly selected: () => string | undefined;
  }) => Promise<void>,
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
  try {
    const { createRoot } = await import('react-dom/client');
    const main = dom.window.document.querySelector('main');
    assert.ok(main);
    const root = createRoot(main);
    const posted: CommanderToHost[] = [];
    const commander = createCommanderStore((message) => posted.push(message), {
      view: {
        ...emptyView,
        tab: '1',
        active: 'left',
        platform: 'win32',
        panes: { left: workPane(), right: undefined },
      },
    });
    const shell = createShellStore(noop);
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
      selected: () => commander.getState().view.panes.left?.selected,
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

const shownFolderMenu = [
  strings.commander.newTerminalHere,
  strings.commander.cloneHere,
  strings.commander.initHere,
  strings.commander.showMoreOptions,
];

suite('Commander menu on a side', () => {
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
          strings.commander.showMoreOptions,
        ]);
        choose(strings.commander.openInGit);

        rightClick(rowNamed(main, 'notes'));
        assert.strictEqual(selected(), 'notes.txt');
        assert.deepStrictEqual(menu(), [
          strings.commander.tryEnterArchive,
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
});
