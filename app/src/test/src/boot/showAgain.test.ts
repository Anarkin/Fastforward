import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { showAgain } from '../../../boot/showAgain';

suite('Showing a window again', () => {
  test('brings the window to the front when the app is started again, restoring it once minimized, but leaves one closed as the app quits, as that threw', () => {
    const calls: string[] = [];
    let minimized = true;
    let destroyed = false;
    const window = {
      isDestroyed: () => destroyed,
      isMinimized: () => {
        if (destroyed) {
          throw new TypeError('Object has been destroyed');
        }
        return minimized;
      },
      restore: () => calls.push('restore'),
      focus: () => calls.push('focus'),
    };
    showAgain(window);
    minimized = false;
    showAgain(window);
    destroyed = true;
    showAgain(window);
    assert.deepStrictEqual(calls, ['restore', 'focus', 'focus']);
  });
});
