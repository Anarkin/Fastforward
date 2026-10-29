import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { terminalKey } from '../../../../tools/terminal/page/keys';
import { keyPress, withMacKeys } from '../../../fixtures';

const ctrl = { ctrlKey: true };
const ctrlShift = { ctrlKey: true, shiftKey: true };

suite('Terminal keys', () => {
  test('leaves Ctrl+C to the shell to stop a command, unless text is selected, which it copies', () => {
    assert.strictEqual(terminalKey(keyPress('c', ctrl), false), 'shell');
    assert.strictEqual(terminalKey(keyPress('c', ctrl), true), 'copy');
  });

  test('copies on Ctrl+Shift+C, selected or not, and on Cmd+C on macOS', () => {
    assert.strictEqual(terminalKey(keyPress('C', ctrlShift), false), 'copy');
    assert.strictEqual(
      withMacKeys(() => terminalKey(keyPress('c', { metaKey: true }), true)),
      'copy',
    );
  });

  test('pastes on Ctrl+V and Ctrl+Shift+V, or Cmd+V on macOS', () => {
    assert.strictEqual(terminalKey(keyPress('v', ctrl), false), 'paste');
    assert.strictEqual(terminalKey(keyPress('V', ctrlShift), false), 'paste');
    assert.strictEqual(
      withMacKeys(() => terminalKey(keyPress('v', { metaKey: true }), false)),
      'paste',
    );
  });

  test('leaves switching, opening and closing tabs to the app, held down too, but Ctrl+T and Ctrl+W to the shell', () => {
    assert.strictEqual(terminalKey(keyPress('Tab', ctrl), false), 'app');
    assert.strictEqual(terminalKey(keyPress('Tab', ctrlShift), false), 'app');
    assert.strictEqual(
      terminalKey(keyPress('T', { ...ctrlShift, repeat: true }), false),
      'app',
    );
    assert.strictEqual(terminalKey(keyPress('W', ctrlShift), false), 'app');
    assert.strictEqual(terminalKey(keyPress('t', ctrl), false), 'shell');
    assert.strictEqual(terminalKey(keyPress('w', ctrl), false), 'shell');
  });

  test('leaves every other key to the shell, the app shortcuts included', () => {
    for (const press of [
      keyPress('F1'),
      keyPress('?'),
      keyPress('f', { altKey: true }),
      keyPress('Delete'),
      keyPress('Escape'),
    ]) {
      assert.strictEqual(terminalKey(press, true), 'shell', press.key);
    }
  });
});
