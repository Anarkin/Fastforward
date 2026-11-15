import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { menuIn, nextMenu } from '../../../../shell/page/openedMenu';

suite('Shell store', () => {
  test('closes a menu once another tab is shown, as its items act on the one it opened in', () => {
    const menu = { x: 1, y: 2, items: [] };
    const opened = { tab: '1', menu, id: 1 };
    assert.strictEqual(menuIn(opened, '1'), menu);
    assert.strictEqual(menuIn(opened, '2'), undefined);
    assert.strictEqual(menuIn(opened, undefined), undefined);
    assert.strictEqual(
      menuIn({ tab: undefined, menu, id: 1 }, undefined),
      menu,
    );
    assert.strictEqual(menuIn(undefined, '1'), undefined);
  });

  test('opens each menu anew, so one opened over another, as the + menu over a commit menu, takes the focus and none of its submenus', () => {
    const menu = { x: 1, y: 2, items: [] };
    const first = nextMenu(undefined, '1', menu);
    const second = nextMenu(first, '1', menu);
    assert.notStrictEqual(first.id, second.id);
    assert.notStrictEqual(nextMenu(undefined, '1', menu).id, second.id);
  });
});
