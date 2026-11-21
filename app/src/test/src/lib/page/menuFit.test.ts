import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { menuFit } from '../../../../lib/page/menuFit';

const view = { width: 1402, height: 900, ratio: 1.25 };

suite('Fitting a menu into the window', () => {
  test('moves a menu running past the right edge of the window back inside by as much, but never past the left edge', () => {
    assert.deepStrictEqual(
      menuFit(
        undefined,
        { left: 823.2, right: 1485.6, top: 72.2 },
        66,
        false,
        view,
      ),
      { tallest: undefined, moved: 1485.6 - (1402 - 4) },
    );
    assert.deepStrictEqual(
      menuFit(undefined, { left: 10, right: 1500, top: 72 }, 66, false, view),
      { tallest: undefined, moved: 6 },
    );
  });

  test('leaves a menu inside the window where it is', () => {
    assert.strictEqual(
      menuFit(undefined, { left: 100, right: 300, top: 72 }, 66, false, view),
      undefined,
    );
  });

  test('keeps a menu moved inside the window where it is once it measures less than half a device pixel past the edge, as at 125% a menu moved in ran 0.00006 pixels past it at every measure without moving, and moving it by that again and again crashed the page', () => {
    assert.strictEqual(
      menuFit(
        { tallest: undefined, moved: 87.60296630859375 },
        { left: 735.6000366210938, right: 1398.00006103515625, top: 72.2 },
        66,
        false,
        view,
      ),
      undefined,
    );
  });

  test('moves a menu again once it measures half a device pixel or more from where it was put, as when the window was narrowed', () => {
    assert.deepStrictEqual(
      menuFit(
        { tallest: undefined, moved: 87.6 },
        { left: 735.6, right: 1398.4, top: 72.2 },
        66,
        false,
        view,
      ),
      { tallest: undefined, moved: 1398.4 + 87.6 - (1402 - 4) },
    );
  });

  test('ends a menu that scrolls at the bottom of the room below it, and only once that room changes by half a device pixel', () => {
    const room = 900 - 72.2 - 4;
    assert.deepStrictEqual(
      menuFit(
        undefined,
        { left: 100, right: 300, top: 72.2 },
        2000,
        true,
        view,
      ),
      { tallest: room, moved: 0 },
    );
    assert.strictEqual(
      menuFit(
        { tallest: room, moved: 0 },
        { left: 100, right: 300, top: 72.2 + 0.0001 },
        2000,
        true,
        view,
      ),
      undefined,
    );
    assert.strictEqual(
      menuFit(
        undefined,
        { left: 100, right: 300, top: 72.2 },
        2000,
        false,
        view,
      ),
      undefined,
    );
  });
});
