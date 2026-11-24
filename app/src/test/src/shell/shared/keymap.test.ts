import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { shellKeymap } from '../../../../shell/shared/keymap';
import { keyPressed } from '../../../../lib/page/shortcuts';
import { clicked, pressed, type Binding } from '../../../../lib/shared/keymap';
import { element } from '../../../helpers/fixtures';
import { keyPress, noModifiers, withMacKeys } from '../../../helpers/keys';

type KeyEvent = Parameters<typeof keyPressed>[1];

const shortcuts = (key: string, extra: Partial<KeyEvent> = {}) =>
  keyPressed(shellKeymap.shortcuts, keyPress(key, extra)) === true;

const about = (extra: Partial<KeyEvent> = {}) =>
  keyPressed(shellKeymap.about, keyPress('F1', extra)) === true;

function shifted(key: string) {
  return keyPress(key, { shiftKey: true });
}

const inField = (binding: Binding<1 | -1>, key: string, held = {}) =>
  pressed(binding, keyPress(key, held), true);

suite('Keymap of the shell', () => {
  test('opens the main menu with F10, rather than Alt+F, which the commander takes to filter by its letter, from a text field too, which types nothing for it', () => {
    assert.strictEqual(
      pressed(shellKeymap.mainMenu, keyPress('F10'), false),
      true,
    );
    assert.strictEqual(
      pressed(shellKeymap.mainMenu, keyPress('f', { altKey: true }), false),
      undefined,
    );
    assert.strictEqual(
      pressed(shellKeymap.mainMenu, keyPress('F10'), true),
      true,
    );
  });

  test('closes the repository on Ctrl+W, or Cmd+W on macOS, as on a middle click on its tab', () => {
    assert.strictEqual(
      pressed(shellKeymap.closeTab, keyPress('w', { ctrlKey: true }), false),
      true,
    );
    assert.strictEqual(
      withMacKeys(() =>
        pressed(shellKeymap.closeTab, keyPress('w', { metaKey: true }), false),
      ),
      true,
    );
    assert.strictEqual(
      clicked(shellKeymap.closeTab, { button: 1, ...noModifiers }),
      true,
    );
    assert.strictEqual(
      pressed(shellKeymap.closeTab, keyPress('w'), false),
      undefined,
    );
  });

  test('opens and closes tabs on Ctrl+Shift+T and Ctrl+Shift+W too, or Cmd+Shift on macOS, even in a field, as a terminal leaves Ctrl+T and Ctrl+W to its shell', () => {
    assert.strictEqual(
      pressed(shellKeymap.newTab, { ...shifted('T'), ctrlKey: true }, true),
      true,
    );
    assert.strictEqual(
      pressed(shellKeymap.closeTab, { ...shifted('W'), ctrlKey: true }, true),
      true,
    );
    assert.strictEqual(
      withMacKeys(() =>
        pressed(shellKeymap.closeTab, { ...shifted('W'), metaKey: true }, true),
      ),
      true,
    );
    assert.strictEqual(
      pressed(shellKeymap.newTab, shifted('T'), false),
      undefined,
    );
  });

  test('opens a new window on Ctrl+N and Ctrl+Shift+N, or Cmd on macOS, as a terminal leaves Ctrl+N to its shell', () => {
    assert.strictEqual(
      pressed(shellKeymap.newWindow, keyPress('n', { ctrlKey: true }), false),
      true,
    );
    assert.strictEqual(
      pressed(shellKeymap.newWindow, { ...shifted('N'), ctrlKey: true }, false),
      true,
    );
    assert.strictEqual(
      withMacKeys(() =>
        pressed(shellKeymap.newWindow, keyPress('n', { metaKey: true }), false),
      ),
      true,
    );
    assert.strictEqual(
      pressed(shellKeymap.newWindow, keyPress('n'), false),
      undefined,
    );
  });

  test('opens the folder of the tab in another tool on Ctrl+Shift+O, or Cmd+Shift+O on macOS, but not on Ctrl+O, which a shell takes', () => {
    assert.strictEqual(
      pressed(shellKeymap.openIn, { ...shifted('O'), ctrlKey: true }, false),
      true,
    );
    assert.strictEqual(
      withMacKeys(() =>
        pressed(shellKeymap.openIn, { ...shifted('O'), metaKey: true }, false),
      ),
      true,
    );
    assert.strictEqual(
      pressed(shellKeymap.openIn, keyPress('o', { ctrlKey: true }), false),
      undefined,
    );
  });

  test('moves through the shortcuts screen from its filter: Ctrl+Tab and Ctrl+Shift+Tab to the next and previous tool, ↑ and ↓ through the groups, and PgUp and PgDn a page, held down too', () => {
    assert.strictEqual(
      inField(shellKeymap.shortcutsTool, 'Tab', { ctrlKey: true }),
      1,
    );
    assert.strictEqual(
      inField(shellKeymap.shortcutsTool, 'Tab', {
        ctrlKey: true,
        shiftKey: true,
      }),
      -1,
    );
    assert.strictEqual(inField(shellKeymap.shortcutsTool, 'Tab'), undefined);
    assert.strictEqual(inField(shellKeymap.shortcutsGroup, 'ArrowDown'), 1);
    assert.strictEqual(inField(shellKeymap.shortcutsGroup, 'ArrowUp'), -1);
    assert.strictEqual(inField(shellKeymap.shortcutsPage, 'PageDown'), 1);
    assert.strictEqual(inField(shellKeymap.shortcutsPage, 'PageUp'), -1);
    assert.strictEqual(
      inField(shellKeymap.shortcutsGroup, 'ArrowDown', { repeat: true }),
      1,
    );
  });

  test('shows the shortcuts on F1, even in a field, or on ? outside one', () => {
    assert.ok(shortcuts('F1'));
    assert.ok(shortcuts('F1', { target: element('INPUT') }));
    assert.ok(shortcuts('?', { shiftKey: true }));
    assert.ok(!shortcuts('?', { shiftKey: true, target: element('INPUT') }));
    assert.ok(!shortcuts('F1', { ctrlKey: true }));
    assert.ok(!shortcuts('F1', { shiftKey: true }));
    assert.ok(!shortcuts('?', { altKey: true }));
    assert.ok(!shortcuts('F1', { repeat: true }));
    assert.ok(!shortcuts('F2'));
  });

  test('shows About on Shift+F1, even in a field, but not on F1 alone, which shows the shortcuts', () => {
    assert.ok(about({ shiftKey: true }));
    assert.ok(about({ shiftKey: true, target: element('INPUT') }));
    assert.ok(!about());
    assert.ok(!about({ shiftKey: true, ctrlKey: true }));
    assert.ok(!about({ shiftKey: true, repeat: true }));
  });
});
