import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  keepOnAppPage,
  lockDown,
  opensExternally,
} from '../../../boot/lockDown';

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

  test('lets the window go nowhere but its own page, by a link or a redirect, as a file it serves, such as an SVG, would run as a page of the app', () => {
    const listeners = new Map<
      string,
      (event: { readonly url: string; preventDefault(): void }) => void
    >();
    keepOnAppPage({
      on: (event, listener) => {
        listeners.set(event, listener);
      },
    });
    const prevented = (event: string, url: string) => {
      let blocked = false;
      listeners.get(event)?.({
        url,
        preventDefault: () => {
          blocked = true;
        },
      });
      return blocked;
    };

    assert.deepStrictEqual(
      ['will-navigate', 'will-redirect'].map((event) =>
        [
          'fastforward://app/index.html',
          'fastforward://app/commander-file?tab=1&file=drawing.svg',
          'https://example.com/',
        ].map((url) => prevented(event, url)),
      ),
      [
        [false, true, true],
        [false, true, true],
      ],
    );
  });
});
