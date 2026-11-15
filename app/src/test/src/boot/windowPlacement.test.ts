import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  cascaded,
  firstWindowSize,
  minimumHeight,
  minimumWidth,
  restoresMaximized,
  visibleBounds,
} from '../../../boot/windowPlacement';

suite('Window bounds', () => {
  const screens = [
    { x: 0, y: 0, width: 1920, height: 1040 },
    { x: 1920, y: 0, width: 1280, height: 1024 },
  ];

  test('opens a new window a little right of and below the one it is opened from, as large as it', () => {
    assert.deepStrictEqual(
      cascaded({ x: 100, y: 50, width: 1200, height: 800 }, screens[0]),
      { x: 132, y: 82, width: 1200, height: 800 },
    );
    assert.deepStrictEqual(
      cascaded({ x: 2000, y: 50, width: 800, height: 600 }, screens[1]),
      { x: 2032, y: 82, width: 800, height: 600 },
    );
  });

  test('opens a new window at the left or top of the screen once it would reach past that edge, no larger than the screen, and a step smaller from a window as large as the screen, so it never lies right over the one it is opened from and stays on the screen', () => {
    assert.deepStrictEqual(
      cascaded({ x: 700, y: 400, width: 1200, height: 800 }, screens[0]),
      { x: 0, y: 0, width: 1200, height: 800 },
    );
    assert.deepStrictEqual(
      cascaded({ x: 0, y: 0, width: 2500, height: 1200 }, screens[0]),
      { x: 32, y: 32, width: 1888, height: 1008 },
    );
  });

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

  test('fits a window into the screen it is mostly on when part of it is off every screen, as one saved on a larger screen opened with its window buttons out of reach', () => {
    const laptop = [{ x: 0, y: 0, width: 1280, height: 752 }];
    assert.deepStrictEqual(
      visibleBounds({ x: 300, y: 200, width: 1800, height: 1100 }, laptop),
      { x: 0, y: 0, width: 1280, height: 752 },
    );
    assert.deepStrictEqual(
      visibleBounds({ x: 1500, y: 100, width: 800, height: 600 }, [screens[0]]),
      { x: 1120, y: 100, width: 800, height: 600 },
    );
    assert.deepStrictEqual(
      visibleBounds({ x: 1500, y: 100, width: 800, height: 600 }, screens),
      { x: 1500, y: 100, width: 800, height: 600 },
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

  const large = { x: 0, y: 0, width: 3840, height: 2160 };

  test('keeps a window at least 720 pixels high, lowering that to fit the shortest screen, as a 1080p screen at 150% has 672 pixels above its taskbar', () => {
    assert.strictEqual(minimumHeight([large]), 720);
    assert.strictEqual(
      minimumHeight([...screens, { x: 3200, y: 0, width: 1280, height: 672 }]),
      672,
    );
  });

  test('keeps a window at least 1280 pixels wide, lowering that to fit the narrowest screen, as the window could not be narrowed to fit a 1366 by 768 screen at 125%', () => {
    assert.strictEqual(minimumWidth([large]), 1280);
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
});
