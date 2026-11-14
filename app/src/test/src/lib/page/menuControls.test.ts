import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  accessKeyOf,
  claimsMenuKey,
  nextMenuItem,
  openedSubmenu,
  submenuPlacement,
} from '../../../../lib/page/menuControls';
import { keyPress, noop } from '../../../helpers/fixtures';

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

  test('opens to the right and down from its entry when it fits', () => {
    assert.deepStrictEqual(
      submenuPlacement({ top: 100, right: 700, bottom: 500 }, window),
      { flipped: false, up: 0 },
    );
  });

  test('opens to the left when it would run off the right of the window', () => {
    assert.deepStrictEqual(
      submenuPlacement({ top: 100, right: 801, bottom: 500 }, window),
      { flipped: true, up: 0 },
    );
  });

  test('moves up to end at the bottom of the window when it would run off it', () => {
    assert.deepStrictEqual(
      submenuPlacement({ top: 400, right: 700, bottom: 750 }, window),
      { flipped: false, up: 150 },
    );
  });

  test('moves up no further than the top of the window when taller than it', () => {
    assert.deepStrictEqual(
      submenuPlacement({ top: 400, right: 700, bottom: 1100 }, window),
      { flipped: false, up: 400 },
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
