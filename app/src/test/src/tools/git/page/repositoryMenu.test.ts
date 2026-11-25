import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  repositoryMenuItems,
  type RepositoryMenuActions,
} from '../../../../../tools/git/page/repositoryMenu';

const ignored: RepositoryMenuActions = {
  onOpen: () => undefined,
  onBrowse: () => undefined,
  onClone: () => undefined,
  onInit: () => undefined,
};

suite('Repository menu', () => {
  test('offers Open..., Clone... and Init... first, then lists the recent repositories by their whole paths, drawn as paths, with no tooltip repeating a path', () => {
    const asked: string[] = [];
    const items = repositoryMenuItems([{ root: '/code/app', name: 'app' }], {
      onOpen: (root) => asked.push(`open ${root}`),
      onBrowse: () => asked.push('browse'),
      onClone: () => asked.push('clone'),
      onInit: () => asked.push('init'),
    });
    assert.deepStrictEqual(
      items.map((item) =>
        'separator' in item
          ? '-'
          : `${item.label} ${item.path === true ? 'path' : ''}${item.title === undefined ? '' : ' tip'}`,
      ),
      ['Open... ', 'Clone... ', 'Init... ', '-', '/code/app path'],
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

  test('offers to remove each recent repository from the list, naming it by its whole path, but not Open..., Clone... or Init...', () => {
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
    assert.strictEqual(app.removeTitle, 'Remove /code/app from this list');
    app.onRemove?.();
    assert.deepStrictEqual(removed, ['/code/app']);
    assert.strictEqual(browse.onRemove, undefined);
    assert.strictEqual(clone.onRemove, undefined);
    assert.strictEqual(init.onRemove, undefined);
  });

  test('tells recent repositories named the same apart by their whole paths', () => {
    const items = repositoryMenuItems(
      [
        { root: '/code/site', name: 'site', folder: 'code' },
        { root: '/code/x/site', name: 'site', folder: 'x' },
      ],
      ignored,
    );
    assert.deepStrictEqual(
      items.flatMap((item) =>
        'separator' in item || item.onClick === undefined ? [] : [item.label],
      ),
      ['Open...', 'Clone...', 'Init...', '/code/site', '/code/x/site'],
    );
  });

  test('leaves out the separator once no recent repository is left', () => {
    assert.deepStrictEqual(
      repositoryMenuItems([], ignored).map((item) =>
        'separator' in item ? '-' : item.label,
      ),
      ['Open...', 'Clone...', 'Init...'],
    );
  });
});
