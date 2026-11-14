import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { whileWindowOpen } from '../../../boot/whileWindowOpen';

suite('Watching for the window', () => {
  test('stops watching once the window closes, and does nothing for a change told after it is gone', () => {
    const closing: (() => void)[] = [];
    let destroyed = false;
    const window = {
      isDestroyed: () => destroyed,
      once: (_event: 'closed', listener: () => void) => {
        closing.push(listener);
      },
    };
    const applied: string[] = [];
    let changed: ((change: string) => void) | undefined;
    let stopped = 0;
    whileWindowOpen(window, (ifOpen) => {
      changed = (change) => ifOpen(() => applied.push(change));
      return () => {
        stopped++;
      };
    });
    changed?.('settings');
    destroyed = true;
    changed?.('too late');
    for (const listener of closing) {
      listener();
    }
    assert.deepStrictEqual(applied, ['settings']);
    assert.strictEqual(stopped, 1);
  });
});
