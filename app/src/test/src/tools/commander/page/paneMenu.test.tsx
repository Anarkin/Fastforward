import * as assert from 'node:assert';
import { suite, test, vi } from 'vitest';
import { act, createRef } from 'react';
import { strings } from '../../../../../lib/shared/strings';
import { Pane } from '../../../../../tools/commander/page/pane';
import type { PaneView } from '../../../../../tools/commander/page/paneView';
import type { Layout } from '../../../../../tools/commander/page/layouts';
import type { CommanderToWebview } from '../../../../../tools/commander/shared/protocol';
import { inSide, pane, rowNamed, sort } from './paneFixtures';
import {
  PathMenuContext,
  type PathMenuAsk,
} from '../../../../../lib/page/pathMenu';

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
      driveTrigger={createRef()}
      bookmarkTrigger={createRef()}
      resizer={null}
    />,
    run,
    layout,
    shownPane,
  );

const settings = (gitMissing: boolean): CommanderToWebview => ({
  type: 'settings',
  showHidden: true,
  sort: { left: sort, right: sort },
  columns: { extension: 10, size: 17, date: 16 },
  defaultColumns: { extension: 10, size: 17, date: 16 },
  canElevate: false,
  platform: 'win32',
  thumbnailSize: 144,
  fileColors: [],
  bookmarks: ['/work/docs'],
  ...(gitMissing && { gitMissing: true }),
});

const shownFolderMenu = [
  strings.commander.openWithTerminal,
  strings.commander.openWithCommander,
  strings.commander.cloneWithGit,
  strings.commander.initWithGit,
  strings.commander.copyPath,
  strings.commander.showMoreOptions,
];

suite('Commander menu on a side', () => {
  test('hands the focus to the list of the side once a drive or a bookmark is chosen from the menus atop its path, so its keys work at once', async () => {
    await inPane(async ({ main }) => {
      const chosenFrom = async (title: string, label: string) => {
        const trigger = main.querySelector<HTMLButtonElement>(
          `button[aria-label="${title}"]`,
        );
        assert.ok(trigger, title);
        await act(async () => trigger.focus());
        await act(async () => trigger.click());
        const item = [
          ...main.querySelectorAll<HTMLButtonElement>('.menu-item'),
        ].find((each) => each.textContent.includes(label));
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
        ],
        [true, true],
      );
    });
  });

  test('draws no path in the hidden button of the drives, so the drive of the path itself is the first part of its row, which a click opens the drives on, checked in the menu of the drives', async () => {
    await inPane(
      async ({ main }) => {
        const trigger = main.querySelector<HTMLButtonElement>(
          `button[aria-label="${strings.commander.chooseDrive}"]`,
        );
        assert.ok(trigger);
        assert.strictEqual(trigger.querySelector('.path-part'), null);
        const drive = main.querySelector('.commander-path .path-part');
        assert.ok(drive);
        const named = drive.textContent;
        await act(async () => {
          drive.dispatchEvent(
            new (main.ownerDocument.defaultView ?? window).MouseEvent('click', {
              bubbles: true,
            }),
          );
        });
        const checked = [
          ...main.querySelectorAll<HTMLButtonElement>(
            '.menu-item[aria-checked="true"]',
          ),
        ].map((each) => each.textContent);
        assert.deepStrictEqual(
          checked.map((each) => each.includes(named.replace(/\$/, ''))),
          [true],
          `${named} checked among ${checked.join(', ')}`,
        );
      },
      undefined,
      pane(false, []),
    );
  });

  test('asks for the menu of the folder or file a part of the path of a side is on a right click on the part', async () => {
    const asked: PathMenuAsk[] = [];
    await inSide(
      <PathMenuContext value={(ask) => asked.push(ask)}>
        <Pane
          side="left"
          driveTrigger={null}
          bookmarkTrigger={null}
          resizer={null}
        />
      </PathMenuContext>,
      async ({ main, rightClick, menu }) => {
        const [top, work] = main.querySelectorAll('.commander-path .path-part');
        rightClick(top ?? null);
        rightClick(work ?? null);
        assert.deepStrictEqual(menu(), []);
        assert.deepStrictEqual(
          asked.map((ask) => [ask.path, ask.file]),
          [
            ['/', false],
            ['/work', false],
          ],
        );
      },
    );
  });

  test('opens the menu of the folder shown on a right click on its path outside its parts, copying its path as text', async () => {
    await inPane(async ({ main, rightClick, menu, choose, copied }) => {
      rightClick(main.querySelector('.commander-path'));
      assert.deepStrictEqual(menu(), shownFolderMenu);
      choose(strings.commander.copyPath);
      rightClick(rowNamed(main, 'notes'));
      choose(strings.commander.copyPath);

      assert.deepStrictEqual(copied(), ['/work', '/work\\notes.txt']);
    });
  });

  test('opens the menu of the folder shown on a right click on .. or on the empty space, asking for its commands without naming a folder', async () => {
    await inPane(async ({ main, rightClick, menu, choose, posted }) => {
      rightClick(main.querySelector('.commander-row'));
      assert.deepStrictEqual(menu(), shownFolderMenu);
      choose(strings.commander.openWithTerminal);

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

  test('opens the menu of a folder or file clicked, selecting it, a repository offered to open in git, a folder in the commander too, the diff comparing files as Shift+F3 does, a file alone with its history', async () => {
    await inPane(
      async ({ main, rightClick, menu, choose, posted, selected }) => {
        rightClick(rowNamed(main, 'app'));
        assert.strictEqual(selected(), 'app');
        assert.deepStrictEqual(menu(), [
          strings.commander.openWithTerminal,
          strings.commander.openWithCommander,
          strings.commander.openWithGit,
          strings.commander.copyPath,
          strings.commander.showMoreOptions,
        ]);
        choose(strings.commander.openWithGit);
        choose(strings.commander.openWithCommander);

        rightClick(rowNamed(main, 'notes'));
        assert.strictEqual(selected(), 'notes.txt');
        assert.deepStrictEqual(menu(), [
          strings.commander.openWithSevenZip,
          strings.commander.openWithViewer,
          strings.commander.openWithDiff,
          strings.commander.openWithEditor,
          strings.commander.copyPath,
          strings.commander.showMoreOptions,
        ]);
        choose(strings.commander.openWithDiff);

        assert.deepStrictEqual(posted, [
          {
            type: 'folderCommand',
            tab: '1',
            side: 'left',
            folder: '/work',
            name: 'app',
            command: 'openInGit',
          },
          {
            type: 'folderCommand',
            tab: '1',
            side: 'left',
            folder: '/work',
            name: 'app',
            command: 'openInCommander',
          },
          {
            type: 'compare',
            tab: '1',
            files: [{ side: 'left', folder: '/work', name: 'notes.txt' }],
          },
        ]);
      },
    );
  });

  test('hides the git icon of a repository and the git items of the menus while the main process says git is missing, and shows them again once it says git is found', async () => {
    await inPane(async ({ main, rightClick, menu, receive }) => {
      const mark = () =>
        rowNamed(main, 'app')?.querySelector('.commander-mark');
      const gitItems = () =>
        menu().filter((label) =>
          [
            strings.commander.openWithGit,
            strings.commander.cloneWithGit,
            strings.commander.initWithGit,
          ].includes(label),
        );
      const shownGit = () => {
        rightClick(rowNamed(main, 'app'));
        const onRepository = gitItems();
        rightClick(main.querySelector('.column-body'));
        return [mark() !== null, onRepository, gitItems()];
      };
      const withGit = [
        true,
        [strings.commander.openWithGit],
        [strings.commander.cloneWithGit, strings.commander.initWithGit],
      ];

      assert.deepStrictEqual(shownGit(), withGit);
      receive(settings(true));
      assert.deepStrictEqual(shownGit(), [false, [], []]);
      assert.strictEqual(
        rowNamed(main, 'app')?.querySelector('.commander-extension')
          ?.textContent,
        '',
      );
      receive(settings(false));
      assert.deepStrictEqual(shownGit(), withGit);
    });
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
