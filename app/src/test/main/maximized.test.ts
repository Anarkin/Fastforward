import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { tellMaximized } from '../../main/maximized';

suite('Maximized', () => {
  test('tells the page whether the window fills the screen as it loads and whenever it is maximized, restored or made fullscreen or left', () => {
    const listeners = new Map<string, () => void>();
    const shown = { maximized: false, fullScreen: false };
    const told: boolean[] = [];
    tellMaximized(
      {
        on: (event: string, listener: () => void) => {
          listeners.set(event, listener);
        },
        isMaximized: () => shown.maximized,
        isFullScreen: () => shown.fullScreen,
        webContents: {
          on: (event: string, listener: () => void) => {
            listeners.set(event, listener);
          },
        },
      },
      (maximized) => told.push(maximized),
    );
    const happen = (event: string) => listeners.get(event)?.();
    happen('did-finish-load');
    shown.maximized = true;
    happen('maximize');
    shown.maximized = false;
    happen('unmaximize');
    shown.fullScreen = true;
    happen('enter-full-screen');
    shown.fullScreen = false;
    happen('leave-full-screen');
    assert.deepStrictEqual(told, [false, true, false, true, false]);
  });
});
