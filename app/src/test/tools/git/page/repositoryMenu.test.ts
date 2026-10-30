import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  repositoryMenuItems,
  type RepositoryMenuActions,
} from '../../../../tools/git/page/repositoryMenu';

const ignored: RepositoryMenuActions = {
  onOpen: () => undefined,
  onBrowse: () => undefined,
  onClone: () => undefined,
  onInit: () => undefined,
};

suite('Repository menu', () => {
  test('offers Browse..., Clone... and Init... first, then lists the recent repositories by name', () => {
    const asked: string[] = [];
    const items = repositoryMenuItems([{ root: '/code/app', name: 'app' }], {
      onOpen: (root) => asked.push(`open ${root}`),
      onBrowse: () => asked.push('browse'),
      onClone: () => asked.push('clone'),
      onInit: () => asked.push('init'),
    });
    assert.deepStrictEqual(
      items.map((item) =>
        'separator' in item ? '-' : `${item.label} ${item.title ?? ''}`,
      ),
      ['Browse... ', 'Clone... ', 'Init... ', '-', 'app /code/app'],
    );
    for (const item of items) {
      if (!('separator' in item)) {
        item.onClick?.();
      }
    }
    assert.deepStrictEqual(asked, [
      'browse',
      'clone',
      'init',
      'open /code/app',
    ]);
  });

  test('offers to remove each recent repository from the list, naming it, but not Browse..., Clone... or Init...', () => {
    const removed: string[] = [];
    const items = repositoryMenuItems([{ root: '/code/app', name: 'app' }], {
      ...ignored,
      onRemove: (root) => removed.push(root),
    });
    const [browse, clone, init, , app] = items;
    assert.ok(
      !('separator' in app) &&
        !('separator' in browse) &&
        !('separator' in clone) &&
        !('separator' in init),
    );
    assert.strictEqual(app.removeTitle, 'Remove app from this list');
    app.onRemove?.();
    assert.deepStrictEqual(removed, ['/code/app']);
    assert.strictEqual(browse.onRemove, undefined);
    assert.strictEqual(clone.onRemove, undefined);
    assert.strictEqual(init.onRemove, undefined);
  });

  test('tells recent repositories named the same apart by the folder that differs, in their names and in offering to remove them', () => {
    const items = repositoryMenuItems(
      [
        { root: '/code/site', name: 'site', folder: 'code' },
        { root: '/code/x/site', name: 'site', folder: 'x' },
      ],
      { ...ignored, onRemove: () => undefined },
    );
    assert.deepStrictEqual(
      items.flatMap((item) =>
        'separator' in item || item.removeTitle === undefined
          ? []
          : [[item.label, item.removeTitle]],
      ),
      [
        ['site (code)', 'Remove site (code) from this list'],
        ['site (x)', 'Remove site (x) from this list'],
      ],
    );
  });

  test('leaves out the separator once no recent repository is left', () => {
    assert.deepStrictEqual(
      repositoryMenuItems([], ignored).map((item) =>
        'separator' in item ? '-' : item.label,
      ),
      ['Browse...', 'Clone...', 'Init...'],
    );
  });
});
