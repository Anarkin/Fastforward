import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { strings } from '../../../../lib/shared/strings';
import type { PathFacts } from '../../../../lib/shared/pathFacts';
import type { ContextMenuItem } from '../../../../lib/page/contextMenuItem';
import type { PathMenuAsk } from '../../../../lib/page/pathMenu';
import { pathMenuItems } from '../../../../shell/page/pathMenu';

const facts = (kind: PathFacts['kind'], inRepository = false): PathFacts => ({
  kind,
  inRepository,
  gitMissing: false,
});

function menuOf(
  asked: Partial<PathMenuAsk> & { readonly path: string },
  found: PathFacts,
  platform = 'win32',
) {
  const done: string[] = [];
  const items = pathMenuItems(
    { file: false, at: { x: 0, y: 0 }, extended: false, ...asked },
    found,
    platform,
    {
      command: (command) => done.push(command),
      copy: (text) => done.push(`copy ${text}`),
    },
  );
  const offered = items.flatMap((item: ContextMenuItem) =>
    'separator' in item || item.disabled === true ? [] : [item.label],
  );
  const chooseAll = () => {
    for (const item of items) {
      if (!('separator' in item) && item.disabled !== true) {
        item.onClick?.();
      }
    }
    return done;
  };
  return { offered, chooseAll };
}

const { commander } = strings;

suite('The menu of a part of a path', () => {
  test('offers a folder on disk what the commander offers it, acting on its whole path, the menu of Windows on Windows alone', () => {
    const menu = menuOf({ path: 'C:\\Code' }, facts('folder'));
    assert.deepStrictEqual(menu.offered, [
      commander.openWithTerminal,
      commander.openWithCommander,
      commander.cloneWithGit,
      commander.initWithGit,
      commander.copyPath,
      commander.showMoreOptions,
    ]);
    assert.deepStrictEqual(menu.chooseAll(), [
      'newTerminal',
      'openInCommander',
      'cloneHere',
      'initHere',
      'copy C:\\Code',
      'systemMenu',
    ]);
    assert.ok(
      !menuOf({ path: '/code' }, facts('folder'), 'linux').offered.includes(
        commander.showMoreOptions,
      ),
    );
  });

  test('offers git to open a folder in a repository', () => {
    assert.deepStrictEqual(
      menuOf({ path: 'C:\\Code\\repo' }, facts('folder', true)).offered,
      [
        commander.openWithTerminal,
        commander.openWithCommander,
        commander.openWithGit,
        commander.copyPath,
        commander.showMoreOptions,
      ],
    );
  });

  test('offers a file on disk to open with the commander’s 7-Zip, the viewer, the editor and Paint for an image, as the commander does', () => {
    const menu = menuOf(
      { path: 'C:\\Photos\\a.png', file: true },
      facts('file'),
    );
    assert.deepStrictEqual(menu.offered, [
      commander.openWithSevenZip,
      commander.openWithViewer,
      commander.openWithEditor,
      commander.openWithPaint,
      commander.copyPath,
      commander.showMoreOptions,
    ]);
    assert.deepStrictEqual(menu.chooseAll(), [
      'enterArchive',
      'view',
      'edit',
      'copy C:\\Photos\\a.png',
      'systemMenu',
    ]);
  });

  test('offers a part inside an archive or on no disk only to copy its path', () => {
    assert.deepStrictEqual(
      menuOf({ path: 'C:\\a.zip\\docs\\b.zip', file: true }, facts('inArchive'))
        .offered,
      [commander.copyPath],
    );
    assert.deepStrictEqual(
      menuOf({ path: 'C:\\a.zip\\docs' }, facts('inArchive')).offered,
      [commander.copyPath],
    );
    assert.deepStrictEqual(
      menuOf({ path: 'src/gone.ts', file: true }, facts('missing')).offered,
      [commander.copyPath],
    );
  });
});
