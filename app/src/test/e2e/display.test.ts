import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { assertDisplay } from './display';

suite('Checking for a display to start the app on', () => {
  test('stops with how to get one on Linux without X11 or Wayland', () => {
    assert.throws(() => assertDisplay('linux', {}), /xvfb-run -a npm test/);
  });

  test('passes on Linux with an X11 display', () => {
    assertDisplay('linux', { DISPLAY: ':99' });
  });

  test('passes on Linux with a Wayland display', () => {
    assertDisplay('linux', { WAYLAND_DISPLAY: 'wayland-0' });
  });

  test('passes on Windows and macOS, which always have one', () => {
    assertDisplay('win32', {});
    assertDisplay('darwin', {});
  });
});
