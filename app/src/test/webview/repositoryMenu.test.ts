import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { repositoryMenuItems } from '../../webview/repositoryMenu';

suite('Repository menu', () => {
  test('lists the recent repositories by name, then Browse...', () => {
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
      ['app /code/app', '-', 'Browse... '],
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
    const [app, , browse] = items;
    assert.ok(!('separator' in app) && !('separator' in browse));
    assert.strictEqual(app.removeTitle, 'Remove app from this list');
    app.onRemove?.();
    assert.deepStrictEqual(removed, ['/code/app']);
    assert.strictEqual(browse.onRemove, undefined);
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
