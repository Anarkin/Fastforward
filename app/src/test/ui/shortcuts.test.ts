import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { keymap } from '../../shell/shared/keymap';
import { gitKeymap } from '../../tools/git/shared/keymap';
import { appKeyPressed, keyPressed } from '../../ui/shortcuts';
import { element, keyPress, withMacKeys } from '../fixtures';

type KeyEvent = Parameters<typeof keyPressed>[1];

const shortcuts = (key: string, extra: Partial<KeyEvent> = {}) =>
  keyPressed(keymap.shortcuts, keyPress(key, extra)) === true;

const about = (extra: Partial<KeyEvent> = {}) =>
  keyPressed(keymap.about, keyPress('F1', extra)) === true;

const showsWhitespace = (extra: Partial<KeyEvent> = {}) =>
  keyPressed(gitKeymap.showWhitespace, keyPress('.', extra)) === true;

const within = (inMenu: boolean) =>
  Object.assign(element('BUTTON'), {
    closest: (selector: string) =>
      inMenu && selector === '.menu' ? element('DIV') : null,
  });

suite('Keyboard shortcuts', () => {
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

  test('leaves keys typed into a field to the field', () => {
    for (const target of [
      element('INPUT'),
      element('TEXTAREA'),
      element('SELECT'),
      element('DIV', true),
    ]) {
      assert.strictEqual(
        keyPressed(gitKeymap.commits, keyPress('c', { target })),
        undefined,
      );
    }
    assert.strictEqual(
      keyPressed(
        gitKeymap.commits,
        keyPress('c', { target: element('BUTTON') }),
      ),
      true,
    );
  });

  test('leaves the keys pressed alone in an open menu to the menu, rather than acting on the app behind it, as C hid the commit list from a context menu, but not those pressed with Ctrl, Cmd or Alt, as Ctrl+T closes the menu it opened', () => {
    assert.strictEqual(
      appKeyPressed(gitKeymap.commits, keyPress('c', { target: within(true) })),
      undefined,
    );
    assert.strictEqual(
      appKeyPressed(keymap.shortcuts, keyPress('F1', { target: within(true) })),
      undefined,
    );
    assert.strictEqual(
      appKeyPressed(
        gitKeymap.commits,
        keyPress('c', { target: within(false) }),
      ),
      true,
    );
    assert.strictEqual(
      appKeyPressed(
        gitKeymap.find,
        keyPress('f', { code: 'KeyF', ctrlKey: true, target: within(true) }),
      ),
      true,
    );
  });

  test('leaves every key pressed in a modal dialog to the dialog, rather than acting on the app behind it, as C hid the commit list behind the About popup', () => {
    const inDialog = Object.assign(element('BUTTON'), {
      closest: (selector: string) =>
        selector === "[aria-modal='true']" ? element('DIV') : null,
    });
    assert.strictEqual(
      appKeyPressed(gitKeymap.commits, keyPress('c', { target: inDialog })),
      undefined,
    );
    assert.strictEqual(
      appKeyPressed(
        gitKeymap.find,
        keyPress('f', { code: 'KeyF', ctrlKey: true, target: inDialog }),
      ),
      undefined,
    );
  });

  test('closes the shortcuts with F1 or ? pressed inside their own dialog, as they opened', () => {
    const inDialog = Object.assign(element('DIV'), {
      closest: (selector: string) =>
        selector === "[aria-modal='true']" ? element('DIV') : null,
    });
    assert.strictEqual(
      appKeyPressed(keymap.shortcuts, keyPress('F1', { target: inDialog })),
      true,
    );
    assert.strictEqual(
      appKeyPressed(keymap.shortcuts, keyPress('?', { target: inDialog })),
      true,
    );
  });

  test('shows whitespace on ., the dot it draws for a space, outside a field', () => {
    assert.ok(showsWhitespace());
    assert.ok(!showsWhitespace({ target: element('INPUT') }));
    assert.ok(!showsWhitespace({ ctrlKey: true }));
    assert.ok(!showsWhitespace({ altKey: true }));
    assert.ok(!showsWhitespace({ repeat: true }));
    assert.ok(
      keyPressed(gitKeymap.showWhitespace, keyPress(',')) === undefined,
    );
  });

  test('opens find in the diff on Ctrl+F, or Cmd+F on macOS, whatever the keyboard layout', () => {
    const key = keyPress('f', { code: 'KeyF', ctrlKey: true });
    const isFindShortcut = (event: typeof key) =>
      keyPressed(gitKeymap.find, event) === true;
    assert.ok(isFindShortcut(key));
    assert.ok(
      withMacKeys(() =>
        isFindShortcut({ ...key, ctrlKey: false, metaKey: true }),
      ),
    );
    assert.ok(isFindShortcut({ ...key, key: 'ф' }));
    assert.ok(!isFindShortcut({ ...key, ctrlKey: false }));
    assert.ok(!isFindShortcut({ ...key, shiftKey: true }));
    assert.ok(!isFindShortcut({ ...key, key: 'g', code: 'KeyG' }));
  });
});
