import * as assert from 'node:assert';
import { setTimeout as delay } from 'node:timers/promises';
import { rebuilt } from '../../main/files';
import { reloadOnRebuild } from '../../main/rebuild';

suite('Rebuilding while the app runs', () => {
  test('reloads the page for its script and its HTML, and the defaults for the settings', () => {
    assert.strictEqual(rebuilt('webview.js'), 'page');
    assert.strictEqual(rebuilt('webview.css'), 'page');
    assert.strictEqual(rebuilt('index.html'), 'page');
    assert.strictEqual(rebuilt('settings.json'), 'defaults');
    assert.strictEqual(rebuilt('main.js'), undefined);
    assert.strictEqual(rebuilt(null), undefined);
  });

  test('reloads once for a burst of rebuilds, and stops watching when the window closes, as a rebuild during a restart would reload a destroyed window', async () => {
    let changed: ((event: string, file: string | null) => void) | undefined;
    let closed: (() => void) | undefined;
    const counts = { reloads: 0, defaults: 0, closes: 0 };
    const window = {
      on: (_event: 'closed', listener: () => void) => {
        closed = listener;
      },
      webContents: {
        reloadIgnoringCache: () => {
          counts.reloads += 1;
        },
      },
    };
    reloadOnRebuild(
      window,
      'dist',
      () => {
        counts.defaults += 1;
      },
      (_folder, listener) => {
        changed = listener;
        return {
          close: () => {
            counts.closes += 1;
          },
        };
      },
    );
    changed?.('change', 'webview.js');
    changed?.('change', 'index.html');
    changed?.('change', 'settings.json');
    await delay(100);
    assert.deepStrictEqual(counts, { reloads: 1, defaults: 1, closes: 0 });
    changed?.('change', 'webview.js');
    changed?.('change', 'settings.json');
    closed?.();
    await delay(100);
    assert.deepStrictEqual(counts, { reloads: 1, defaults: 1, closes: 1 });
  });
});
