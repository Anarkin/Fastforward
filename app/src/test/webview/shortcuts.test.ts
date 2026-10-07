import * as assert from 'node:assert';
import { keymap } from '../../shared/keymap';
import { keyPressed } from '../../webview/shortcuts';
import { element, keyPress } from '../fixtures';

type KeyEvent = Parameters<typeof keyPressed>[1];

const shortcuts = (key: string, extra: Partial<KeyEvent> = {}) =>
  keyPressed(keymap.shortcuts, keyPress(key, extra)) === true;

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

  test('leaves keys typed into a field to the field', () => {
    for (const target of [
      element('INPUT'),
      element('TEXTAREA'),
      element('SELECT'),
      element('DIV', true),
    ]) {
      assert.strictEqual(
        keyPressed(keymap.commits, keyPress('c', { target })),
        undefined,
      );
    }
    assert.strictEqual(
      keyPressed(keymap.commits, keyPress('c', { target: element('BUTTON') })),
      true,
    );
  });

  test('opens find in the diff on Ctrl+F, or Cmd+F, whatever the keyboard layout', () => {
    const key = keyPress('f', { code: 'KeyF', ctrlKey: true });
    const isFindShortcut = (event: typeof key) =>
      keyPressed(keymap.find, event) === true;
    assert.ok(isFindShortcut(key));
    assert.ok(isFindShortcut({ ...key, ctrlKey: false, metaKey: true }));
    assert.ok(isFindShortcut({ ...key, key: 'ф' }));
    assert.ok(!isFindShortcut({ ...key, ctrlKey: false }));
    assert.ok(!isFindShortcut({ ...key, shiftKey: true }));
    assert.ok(!isFindShortcut({ ...key, key: 'g', code: 'KeyG' }));
  });
});
