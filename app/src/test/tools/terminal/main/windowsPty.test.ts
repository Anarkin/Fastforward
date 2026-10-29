import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { windowsPtyOf } from '../../../../tools/terminal/main/windowsPty';

suite('Windows pty', () => {
  test('tells xterm.js the build of Windows, whose ConPTY repaints the screen on resize, and nothing elsewhere', () => {
    assert.deepStrictEqual(windowsPtyOf('win32', '10.0.26200'), {
      backend: 'conpty',
      buildNumber: 26200,
    });
    assert.strictEqual(windowsPtyOf('win32', 'unknown'), undefined);
    assert.strictEqual(windowsPtyOf('linux', '6.8.0-45-generic'), undefined);
  });
});
