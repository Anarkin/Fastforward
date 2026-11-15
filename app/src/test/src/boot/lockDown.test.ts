import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { lockDown, opensExternally } from '../../../boot/lockDown';

suite('Locking the window down', () => {
  test('grants the page no permission and downloads nothing, as Alt and a click on a link of a document viewed made the app fetch it', () => {
    const answers: boolean[] = [];
    const listeners = new Map<
      string,
      (event: { preventDefault(): void }) => void
    >();
    let checked: (() => boolean) | undefined;
    let prevented = 0;
    lockDown({
      setPermissionRequestHandler: (handler) =>
        handler(undefined, 'media', (granted) => answers.push(granted)),
      setPermissionCheckHandler: (handler) => {
        checked = handler;
      },
      on: (event, listener) => {
        listeners.set(event, listener);
      },
    });
    listeners.get('will-download')?.({ preventDefault: () => prevented++ });

    assert.deepStrictEqual(
      [answers, checked?.(), prevented],
      [[false], false, 1],
    );
  });

  test('opens only https and mail links outside the app', () => {
    assert.ok(opensExternally('https://github.com/Anarkin/Fastforward'));
    assert.ok(opensExternally('mailto:someone@example.com'));
    for (const url of [
      'http://example.com/',
      'file:///C:/Windows/notepad.exe',
      'fastforward://app/index.html',
      'javascript:alert(1)',
      '',
    ]) {
      assert.ok(!opensExternally(url), url);
    }
  });
});
