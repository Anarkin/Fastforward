import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  appFile,
  isAppUrl,
  lockDown,
  opensExternally,
  startsAppPage,
} from '../../../boot/files';

const start = (url: string, isMainFrame = true, isSameDocument = false) =>
  startsAppPage({ url, isMainFrame, isSameDocument });

suite('App files', () => {
  const root = path.resolve('dist');

  test('serves the page and its files from the build folder', () => {
    assert.strictEqual(
      appFile(root, 'fastforward://app/index.html'),
      path.join(root, 'index.html'),
    );
    assert.strictEqual(
      appFile(root, 'fastforward://app/'),
      path.join(root, 'index.html'),
    );
    assert.strictEqual(
      appFile(root, 'fastforward://app/webview.js?v=1'),
      path.join(root, 'webview.js'),
    );
  });

  test('serves nothing outside the build folder or from another host', () => {
    for (const url of [
      'fastforward://app/%2e%2e/package.json',
      'fastforward://app/..%5Cpackage.json',
      'fastforward://app/..%2Fpackage.json',
    ]) {
      const file = appFile(root, url);
      assert.ok(
        file === undefined || file.startsWith(root + path.sep),
        `${url} served ${file}`,
      );
    }
    assert.strictEqual(
      appFile(root, 'fastforward://other/index.html'),
      undefined,
    );
  });

  test('takes messages and navigation only from its own origin, not one that only starts the same', () => {
    assert.ok(isAppUrl('fastforward://app/index.html'));
    for (const url of [
      'fastforward://app.evil/index.html',
      'fastforward://application/index.html',
      'fastforward://app:1/index.html',
      'https://app/index.html',
      'about:blank',
      '',
    ]) {
      assert.ok(!isAppUrl(url), url);
    }
  });

  test('connects anew only once its own page starts loading, not for a navigation it blocks, such as a file dropped on the window', () => {
    assert.ok(start('fastforward://app/index.html'));
    assert.ok(!start('file:///C:/Users/me/dropped.txt'));
    assert.ok(!start('https://example.com/'));
    assert.ok(!start('fastforward://app/index.html#top', true, true));
    assert.ok(!start('fastforward://app/index.html', false));
  });

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
