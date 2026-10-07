import * as assert from 'node:assert';
import { keymap } from '../shared/keymap';
import { keyPressed } from '../webview/shortcuts';
import { element } from './fixtures';

type KeyEvent = Parameters<typeof keyPressed>[1];

const keyEvent = (key: string, extra: Partial<KeyEvent> = {}): KeyEvent => ({
  key,
  code: '',
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  repeat: false,
  defaultPrevented: false,
  target: null,
  ...extra,
});

const shortcuts = (key: string, extra: Partial<KeyEvent> = {}) =>
  keyPressed(keymap.shortcuts, keyEvent(key, extra)) === true;

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
        keyPressed(keymap.commits, keyEvent('c', { target })),
        undefined,
      );
    }
    assert.strictEqual(
      keyPressed(keymap.commits, keyEvent('c', { target: element('BUTTON') })),
      true,
    );
  });

  test('opens find in the diff on Ctrl+F, or Cmd+F, whatever the keyboard layout', () => {
    const key = {
      key: 'f',
      code: 'KeyF',
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      target: null,
    };
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
