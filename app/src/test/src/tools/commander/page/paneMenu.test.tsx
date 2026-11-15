import * as assert from 'node:assert';
import { suite, test, vi } from 'vitest';
import { act } from 'react';
import { strings } from '../../../../../lib/shared/strings';
import { Pane } from '../../../../../tools/commander/page/pane';
import type { PaneView } from '../../../../../tools/commander/page/view';
import type { Layout } from '../../../../../tools/commander/shared/settings';
import { inSide, rowNamed } from './paneFixtures';

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

const inPane = (
  run: Parameters<typeof inSide>[1],
  layout?: Layout,
  shownPane?: PaneView,
) =>
  inSide(
    <Pane
      side="left"
      driveTrigger={null}
      bookmarkTrigger={null}
      resizer={null}
    />,
    run,
    layout,
    shownPane,
  );

const shownFolderMenu = [
  strings.commander.newTerminalHere,
  strings.commander.cloneHere,
  strings.commander.initHere,
  strings.commander.copyPath,
  strings.commander.copyName,
  strings.commander.goToItem,
  strings.commander.showMoreOptions,
];

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
