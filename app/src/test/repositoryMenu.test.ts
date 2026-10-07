import * as assert from 'node:assert';
import { repositoryMenuItems } from '../webview/repositoryMenu';

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
});
