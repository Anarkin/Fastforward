import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { onWayland } from '../../../boot/x11CellSteps';

suite('Cell steps of X11', () => {
  test('sets no size hints under Wayland, which has no steps to resize a window by and no window of X11 to set them on, unless the app was told to draw through X11', () => {
    assert.deepStrictEqual(
      [
        onWayland({ WAYLAND_DISPLAY: 'wayland-0' }, ''),
        onWayland({ XDG_SESSION_TYPE: 'wayland' }, ''),
        onWayland({}, 'wayland'),
        onWayland({ WAYLAND_DISPLAY: 'wayland-0' }, 'x11'),
        onWayland({ DISPLAY: ':0' }, ''),
      ],
      [true, true, true, false, false],
    );
  });
});
