import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { keptBounds } from '../../../boot/savedBounds';

suite('Kept bounds', () => {
  test('keeps the bounds a window was made with until it is moved or resized, as a window with a hidden title bar says it is larger than made on a scaled screen', () => {
    const made = { x: 100, y: 80, width: 1400, height: 900 };
    let normal = { x: 100, y: 80, width: 1406, height: 905 };
    const kept = keptBounds({ getNormalBounds: () => normal }, made);
    assert.deepStrictEqual(kept.bounds(), made);
    normal = { x: 300, y: 80, width: 1200, height: 800 };
    kept.resized();
    assert.deepStrictEqual(kept.bounds(), normal);
  });

  test('keeps the size a window was made or last resized to when a move changes it only by what a scaled screen adds, as a window with a hidden title bar says it is larger than that there, so it would grow with each start', () => {
    const made = { x: 100, y: 80, width: 1200, height: 800 };
    let normal = { x: 300, y: 120, width: 1207, height: 805 };
    const kept = keptBounds({ getNormalBounds: () => normal }, made);
    kept.moved();
    assert.deepStrictEqual(kept.bounds(), {
      x: 300,
      y: 120,
      width: 1200,
      height: 800,
    });
    normal = { x: 300, y: 120, width: 1000, height: 700 };
    kept.resized();
    normal = { x: 50, y: 60, width: 1006, height: 705 };
    kept.moved();
    assert.deepStrictEqual(kept.bounds(), {
      x: 50,
      y: 60,
      width: 1000,
      height: 700,
    });
  });

  test('takes the size a window has when a move changes it by more than a scaled screen adds, as Windows and macOS tell only that a window moved when it is snapped or tiled to a side', () => {
    const made = { x: 100, y: 80, width: 1400, height: 900 };
    const snapped = { x: 1024, y: 0, width: 1024, height: 1114 };
    const kept = keptBounds({ getNormalBounds: () => snapped }, made);
    kept.moved();
    assert.deepStrictEqual(kept.bounds(), snapped);
  });
});
