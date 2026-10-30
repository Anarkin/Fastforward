import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { folderMenuItems } from '../../../../tools/terminal/page/folderMenu';

suite('Terminal folder menu', () => {
  test('offers New and Browse..., then the folders by their whole paths, opening each', () => {
    const done: string[] = [];
    const items = folderMenuItems(['C:\\Code\\app', 'C:\\Code\\site'], {
      onNew: () => done.push('new'),
      onBrowse: () => done.push('browse'),
      onOpen: (folder) => done.push(`open ${folder}`),
      onForget: (folder) => done.push(`forget ${folder}`),
    });
    assert.deepStrictEqual(
      items.map((item) =>
        'separator' in item ? '-' : `${item.label} ${item.title ?? ''}`,
      ),
      [
        'New ',
        'Browse... ',
        '-',
        'C:\\Code\\app C:\\Code\\app',
        'C:\\Code\\site C:\\Code\\site',
      ],
    );
    for (const item of items) {
      if (!('separator' in item)) {
        item.onClick?.();
      }
    }
    assert.deepStrictEqual(done, [
      'new',
      'browse',
      'open C:\\Code\\app',
      'open C:\\Code\\site',
    ]);
  });

  test('offers to forget each folder, naming it, but not New or Browse...', () => {
    const forgotten: string[] = [];
    const [newTab, browse, , app] = folderMenuItems(['/code/app'], {
      onNew: () => undefined,
      onBrowse: () => undefined,
      onOpen: () => undefined,
      onForget: (folder) => forgotten.push(folder),
    });
    assert.ok(
      !('separator' in newTab) &&
        !('separator' in browse) &&
        !('separator' in app),
    );
    assert.strictEqual(app.removeTitle, 'Remove /code/app from this list');
    app.onRemove?.();
    assert.deepStrictEqual(forgotten, ['/code/app']);
    assert.deepStrictEqual(
      [newTab.onRemove, browse.onRemove],
      [undefined, undefined],
    );
  });

  test('leaves out the separator while no folder is known', () => {
    assert.deepStrictEqual(
      folderMenuItems([], {
        onNew: () => undefined,
        onBrowse: () => undefined,
        onOpen: () => undefined,
        onForget: () => undefined,
      }).map((item) => ('separator' in item ? '-' : item.label)),
      ['New', 'Browse...'],
    );
  });
});
