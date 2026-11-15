import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  appFile,
  isAppPage,
  isAppUrl,
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

  test('serves nothing for a path whose percent signs encode no character, rather than throwing', () => {
    for (const url of [
      'fastforward://app/%E0%A4%A',
      'fastforward://app/%zz.js',
      'fastforward://app/%',
    ]) {
      assert.strictEqual(appFile(root, url), undefined, url);
    }
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

  test('takes only its own page for the page, not a file it serves beside it, as an SVG shown would run as a page of the app', () => {
    assert.ok(isAppPage('fastforward://app/index.html'));
    for (const url of [
      'fastforward://app/commander-file?tab=1&file=drawing.svg',
      'fastforward://app/image?path=drawing.svg',
      'fastforward://app/webview.js',
      'fastforward://app/',
      'fastforward://app.evil/index.html',
      'https://app/index.html',
      '',
    ]) {
      assert.ok(!isAppPage(url), url);
    }
    assert.ok(!start('fastforward://app/commander-file?tab=1&file=a.svg'));
  });
});
