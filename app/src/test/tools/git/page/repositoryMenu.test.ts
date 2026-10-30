import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { repositoryMenuItems } from '../../../../tools/git/page/repositoryMenu';

suite('Repository menu', () => {
  test('offers Browse... first, then lists the recent repositories by name', () => {
    const opened: string[] = [];
    let browsed = 0;
    const items = repositoryMenuItems(
      [{ root: '/code/app', name: 'app' }],
      (root) => opened.push(root),
      () => browsed++,
    );
    assert.deepStrictEqual(
      items.map((item) =>
        'separator' in item ? '-' : `${item.label} ${item.title ?? ''}`,
      ),
      ['Browse... ', '-', 'app /code/app'],
    );
    for (const item of items) {
      if (!('separator' in item)) {
        item.onClick?.();
      }
    }
    assert.deepStrictEqual(opened, ['/code/app']);
    assert.strictEqual(browsed, 1);
  });

  test('offers to remove each recent repository from the list, naming it, but not Browse...', () => {
    const removed: string[] = [];
    const items = repositoryMenuItems(
      [{ root: '/code/app', name: 'app' }],
      () => undefined,
      () => undefined,
      (root) => removed.push(root),
    );
    const [browse, , app] = items;
    assert.ok(!('separator' in app) && !('separator' in browse));
    assert.strictEqual(app.removeTitle, 'Remove app from this list');
    app.onRemove?.();
    assert.deepStrictEqual(removed, ['/code/app']);
    assert.strictEqual(browse.onRemove, undefined);
  });

  test('tells recent repositories named the same apart by the folder that differs, in their names and in offering to remove them', () => {
    const items = repositoryMenuItems(
      [
        { root: '/code/site', name: 'site', folder: 'code' },
        { root: '/code/x/site', name: 'site', folder: 'x' },
      ],
      () => undefined,
      () => undefined,
      () => undefined,
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
      repositoryMenuItems(
        [],
        () => undefined,
        () => undefined,
      ).map((item) => ('separator' in item ? '-' : item.label)),
      ['Browse...'],
    );
  });
});
