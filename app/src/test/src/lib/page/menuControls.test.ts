import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  accessKeyOf,
  claimsMenuKey,
  nextMenuItem,
  openedSubmenu,
  submenuPlace,
} from '../../../../lib/page/menuControls';
import { noop } from '../../../helpers/fixtures';
import { keyPress } from '../../../helpers/keys';

suite('Menu keys', () => {
  test('moves through the items with the arrows, wrapping around, and to either end with Home and End', () => {
    assert.strictEqual(nextMenuItem('next', 0, 3), 1);
    assert.strictEqual(nextMenuItem('next', 2, 3), 0);
    assert.strictEqual(nextMenuItem('previous', 0, 3), 2);
    assert.strictEqual(nextMenuItem('previous', -1, 3), 2);
    assert.strictEqual(nextMenuItem('next', -1, 3), 0);
    assert.strictEqual(nextMenuItem('first', 2, 3), 0);
    assert.strictEqual(nextMenuItem('last', 0, 3), 2);
    assert.strictEqual(nextMenuItem('next', -1, 0), undefined);
  });

  test('keeps every arrow and Tab to itself, so none moves between the columns behind it', () => {
    for (const key of [
      'ArrowRight',
      'ArrowLeft',
      'ArrowUp',
      'ArrowDown',
      'Tab',
    ]) {
      assert.ok(claimsMenuKey(keyPress(key)), key);
    }
    for (const key of ['Enter', 'a', 'Escape']) {
      assert.ok(!claimsMenuKey(keyPress(key)), key);
    }
  });
});

suite('Submenu placement', () => {
  const window = { width: 800, height: 600 };
  const entry = { left: 300, right: 500, top: 104 };

  test('opens on the window to the right of its entry and down from it when it fits, so no menu that scrolls around it cuts it off', () => {
    assert.deepStrictEqual(
      submenuPlace(entry, { width: 200, height: 400 }, window),
      { left: 500, top: 100, height: 500 },
    );
  });

  test('opens to the left when it would run off the right of the window', () => {
    assert.deepStrictEqual(
      submenuPlace(entry, { width: 301, height: 400 }, window),
      { left: 0, top: 100, height: 500 },
    );
    assert.deepStrictEqual(
      submenuPlace(
        { ...entry, left: 400, right: 600 },
        { width: 250, height: 400 },
        window,
      ),
      { left: 150, top: 100, height: 500 },
    );
  });

  test('moves up to end at the bottom of the window when it would run off it, no further than its top, and takes no more height than the window leaves below its top, so a list a filter grows scrolls inside it', () => {
    assert.deepStrictEqual(
      submenuPlace({ ...entry, top: 404 }, { width: 200, height: 350 }, window),
      { left: 500, top: 250, height: 350 },
    );
    assert.deepStrictEqual(
      submenuPlace({ ...entry, top: 404 }, { width: 200, height: 700 }, window),
      { left: 500, top: 0, height: 600 },
    );
  });
});

suite('Menu items', () => {
  test('takes a letter or digit alone, of either case, as an access key', () => {
    assert.strictEqual(accessKeyOf(keyPress('d')), 'D');
    assert.strictEqual(accessKeyOf(keyPress('X')), 'X');
    assert.strictEqual(accessKeyOf(keyPress('7')), '7');
    assert.strictEqual(
      accessKeyOf(keyPress('d', { ctrlKey: true })),
      undefined,
    );
    assert.strictEqual(accessKeyOf(keyPress('d', { altKey: true })), undefined);
    assert.strictEqual(
      accessKeyOf(keyPress('d', { metaKey: true })),
      undefined,
    );
    assert.strictEqual(accessKeyOf(keyPress('Enter')), undefined);
    assert.strictEqual(accessKeyOf(keyPress('-')), undefined);
  });

  test('opens a submenu in place of running it, focusing its first item only on a click from the keyboard', () => {
    const submenu = [{ label: 'x', onClick: noop }];
    assert.deepStrictEqual(openedSubmenu({ submenu }, 0), {
      focusFirst: true,
    });
    assert.deepStrictEqual(openedSubmenu({ submenu }, 1), {
      focusFirst: false,
    });
    assert.strictEqual(openedSubmenu({}, 0), undefined);
  });
});
