import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { copiesPixels, pixelsToSize } from '../../../boot/windowPixels';

const plain = {
  maximized: false,
  fullScreen: false,
  current: { width: 1284, height: 724 },
  normal: { width: 1284, height: 724 },
  sourceScale: 1.25,
  windowScale: 1.25,
};

suite('Sizing a window like another', () => {
  test('copies the device pixels of a window at its normal size on a screen of the same scale, so a tab torn off gets a window as big as the one it left', () => {
    assert.strictEqual(copiesPixels(plain), true);
    assert.strictEqual(
      copiesPixels({ ...plain, normal: { width: 1285, height: 724 } }),
      true,
    );
  });

  test('takes the normal size in pixels of the page from a window maximized, in full screen or snapped to half the screen, as a tab torn off it gets the size the window comes back to, not the size it fills', () => {
    assert.strictEqual(copiesPixels({ ...plain, maximized: true }), false);
    assert.strictEqual(copiesPixels({ ...plain, fullScreen: true }), false);
    assert.strictEqual(
      copiesPixels({ ...plain, current: { width: 1024, height: 1392 } }),
      false,
    );
  });

  test('takes the size in pixels of the page across screens of other scales, as a window gets the size its screen gives those pixels once it moves onto it, so device pixels copied from a screen at 100% onto one at 150% made it two thirds as big', () => {
    assert.strictEqual(copiesPixels({ ...plain, windowScale: 1.5 }), false);
  });
});

suite('Sizing a window to the size it was saved at', () => {
  test('takes the device pixels of a window down by what it grew past the size asked for, as a window saved 1400 by 800 opened 1406 by 804 at 125%', () => {
    assert.deepStrictEqual(
      pixelsToSize(
        { width: 1758, height: 1005 },
        { width: 1406, height: 804 },
        { width: 1400, height: 800 },
        1.25,
      ),
      { width: 1750, height: 1000 },
    );
  });

  test('leaves a window at the size asked for as it is', () => {
    assert.deepStrictEqual(
      pixelsToSize(
        { width: 1750, height: 1000 },
        { width: 1400, height: 800 },
        { width: 1400, height: 800 },
        1.25,
      ),
      { width: 1750, height: 1000 },
    );
  });
});
