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
  const labels = items.map((item: ContextMenuItem) =>
    'separator' in item ? '-' : item.label,
  );
  const chooseAll = () => {
    for (const item of items) {
      if (!('separator' in item)) {
        item.onClick?.();
      }
    }
    return done;
  };
  return { labels, chooseAll };
}

const { commander } = strings;

suite('The menu of a part of a path', () => {
  test('offers a folder on disk what the commander offers it, acting on its whole path, the menu of Windows on Windows alone', () => {
    const menu = menuOf({ path: 'C:\\Code' }, facts('folder'));
    assert.deepStrictEqual(menu.labels, [
      commander.newTerminalHere,
      commander.cloneHere,
      commander.initHere,
      '-',
      commander.copyPath,
      '-',
      commander.showMoreOptions,
    ]);
    assert.deepStrictEqual(menu.chooseAll(), [
      'newTerminal',
      'cloneHere',
      'initHere',
      'copy C:\\Code',
      'systemMenu',
    ]);
    assert.ok(
      !menuOf({ path: '/code' }, facts('folder'), 'linux').labels.includes(
        commander.showMoreOptions,
      ),
    );
  });

  test('offers git to open a folder in a repository, and Go To... only where the part is the folder a side of the commander shows', () => {
    let wentTo = 0;
    const menu = menuOf(
      {
        path: 'C:\\Code\\repo',
        onGoTo: () => {
          wentTo += 1;
        },
      },
      facts('folder', true),
    );
    assert.deepStrictEqual(menu.labels, [
      commander.newTerminalHere,
      commander.openInGit,
      '-',
      commander.copyPath,
      '-',
      commander.goToItem,
      '-',
      commander.showMoreOptions,
    ]);
    assert.deepStrictEqual(menu.chooseAll(), [
      'newTerminal',
      'openInGit',
      'copy C:\\Code\\repo',
      'systemMenu',
    ]);
    assert.strictEqual(wentTo, 1);
  });

  test('offers a file on disk to open with 7-Zip and an image to edit, as the commander does', () => {
    const menu = menuOf(
      { path: 'C:\\Photos\\a.png', file: true },
      facts('file'),
    );
    assert.deepStrictEqual(menu.labels, [
      commander.editImage,
      commander.openWithSevenZip,
      '-',
      commander.copyPath,
      '-',
      commander.showMoreOptions,
    ]);
    assert.deepStrictEqual(menu.chooseAll(), [
      'enterArchive',
      'copy C:\\Photos\\a.png',
      'systemMenu',
    ]);
  });

  test('offers a part inside an archive or on no disk only its copies, and Go To... on the folder a side shows', () => {
    assert.deepStrictEqual(
      menuOf({ path: 'C:\\a.zip\\docs\\b.zip', file: true }, facts('inArchive'))
        .labels,
      [commander.copyPath],
    );
    assert.deepStrictEqual(
      menuOf(
        { path: 'C:\\a.zip\\docs', onGoTo: () => undefined },
        facts('inArchive'),
      ).labels,
      [commander.copyPath, '-', commander.goToItem],
    );
    assert.deepStrictEqual(
      menuOf({ path: 'src/gone.ts', file: true }, facts('missing')).labels,
      [commander.copyPath],
    );
  });
});
