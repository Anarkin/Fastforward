import * as assert from 'node:assert';
import * as path from 'node:path';
import {
  appFile,
  firstWindowSize,
  isAppUrl,
  keptBounds,
  minimumHeight,
  minimumWidth,
  minimumWindowSize,
  opensExternally,
  restoresMaximized,
  startsAppPage,
  visibleBounds,
} from '../../main/files';

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

  test('opens only https links outside the app', () => {
    assert.ok(opensExternally('https://github.com/Anarkin/Fastforward'));
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

suite('Window bounds', () => {
  const screens = [
    { x: 0, y: 0, width: 1920, height: 1040 },
    { x: 1920, y: 0, width: 1280, height: 1024 },
  ];

  test('keeps a window on one of the screens', () => {
    const saved = { x: 2000, y: 100, width: 800, height: 600 };
    assert.deepStrictEqual(visibleBounds(saved, screens), saved);
  });

  test('keeps only the bounds of a window saved with more, as a hand edit can leave it', () => {
    const saved = { x: 2000, y: 100, width: 800, height: 600 };
    assert.deepStrictEqual(
      visibleBounds({ ...saved, fullscreen: true }, screens),
      saved,
    );
  });

  test('forgets a window left on a screen since removed', () => {
    assert.strictEqual(
      visibleBounds({ x: 3500, y: 100, width: 800, height: 600 }, screens),
      undefined,
    );
    assert.strictEqual(
      visibleBounds({ x: -750, y: 100, width: 800, height: 600 }, screens),
      undefined,
    );
  });

  test('ignores bounds that were never saved or saved wrong', () => {
    assert.strictEqual(visibleBounds(undefined, screens), undefined);
    assert.strictEqual(
      visibleBounds({ x: 0, y: 0, width: 'wide', height: 600 }, screens),
      undefined,
    );
  });

  test('lowers the least height of a window to fit the shortest screen, as a 1080p screen at 150% has 672 pixels above its taskbar', () => {
    assert.strictEqual(minimumHeight(screens), minimumWindowSize.height);
    assert.strictEqual(
      minimumHeight([...screens, { x: 3200, y: 0, width: 1280, height: 672 }]),
      672,
    );
  });

  test('lowers the least width of a window to fit the narrowest screen, as the window could not be narrowed to fit a 1366 by 768 screen at 125%', () => {
    assert.strictEqual(minimumWidth(screens), minimumWindowSize.width);
    assert.strictEqual(
      minimumWidth([...screens, { x: 3200, y: 0, width: 1093, height: 728 }]),
      1093,
    );
  });

  test('remembers a minimized window restores maximized, as it says it is not maximized while minimized', () => {
    let minimized = false;
    let maximized = true;
    const window = {
      isMinimized: () => minimized,
      isMaximized: () => maximized,
    };
    const restores = restoresMaximized(window, false);
    assert.strictEqual(restores(), true);
    minimized = true;
    maximized = false;
    assert.strictEqual(restores(), true);
    minimized = false;
    assert.strictEqual(restores(), false);
    minimized = true;
    assert.strictEqual(restoresMaximized(window, true)(), true);
  });

  test('opens a first window at 1400 by 900, or only as large as the work area of a smaller screen', () => {
    assert.deepStrictEqual(
      firstWindowSize({ x: 0, y: 0, width: 1920, height: 1040 }),
      { width: 1400, height: 900 },
    );
    assert.deepStrictEqual(
      firstWindowSize({ x: 0, y: 0, width: 1366, height: 728 }),
      { width: 1366, height: 728 },
    );
  });

  test('keeps the bounds a window was made with until it is moved or resized, as a window with a hidden title bar says it is larger than made on a scaled screen', () => {
    const made = { x: 100, y: 80, width: 1400, height: 900 };
    let normal = { x: 100, y: 80, width: 1406, height: 905 };
    const kept = keptBounds({ getNormalBounds: () => normal }, made);
    assert.deepStrictEqual(kept.bounds(), made);
    normal = { x: 300, y: 80, width: 1200, height: 800 };
    kept.changed();
    assert.deepStrictEqual(kept.bounds(), normal);
  });
});
