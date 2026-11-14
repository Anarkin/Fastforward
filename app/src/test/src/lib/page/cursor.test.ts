import * as assert from 'node:assert';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  thicknessPixels,
  blinkAnimation,
  cursorBlinkInterval,
  cursorBox,
  drawnCursor,
  pixelBox,
  placedBox,
} from '../../../../lib/page/cursor';

const cell = { left: 90, top: 36, width: 9, height: 23 };

const coveredBy = (start: number, end: number) =>
  Math.ceil(end - 0.5) - Math.ceil(start - 0.5);

const drawn = (shape: 'bar' | 'underline' | 'outline') =>
  drawnCursor({
    cell: { left: 80, top: 40, width: 8, height: 20 },
    text: 'x',
    shape,
    thickness: 2,
    ratio: 2,
    origin: { left: 0, top: 0 },
  });

suite('Cursor', () => {
  test('fills the whole cell it is given as a block, two cells as wide for a wide character', () => {
    assert.deepStrictEqual(cursorBox(cell, 'block', 2, 1.25), {
      ...cell,
      edges: undefined,
    });
    const wide = { ...cell, width: 18 };
    assert.deepStrictEqual(cursorBox(wide, 'block', 2, 1.25), {
      ...wide,
      edges: undefined,
    });
  });

  test('draws a bar at the left of the cell, as many device pixels wide as the WebGL renderer of xterm.js fills for its width in whole CSS pixels, and at least one', () => {
    assert.deepStrictEqual(cursorBox(cell, 'bar', 2, 1.25), {
      left: 90,
      top: 36,
      width: 2,
      height: 23,
      edges: undefined,
    });
    for (const ratio of [1, 1.25, 1.5, 1.75, 2, 2.5, 3]) {
      for (const width of [1, 2, 3, 4]) {
        assert.strictEqual(
          thicknessPixels(width, ratio),
          Math.max(1, coveredBy(cell.left, cell.left + width * ratio)),
          `${width} at ${ratio}`,
        );
      }
    }
    assert.strictEqual(thicknessPixels(1, 0.5), 1);
  });

  test('draws the underline and every edge of an outline as thick as a bar of the width of the setting, the underline at the bottom of the cell, the edges of an outline no thicker than half the cell, so it stays a frame', () => {
    for (const ratio of [1, 1.25, 1.5, 1.75, 2, 2.5, 3]) {
      for (const width of [1, 2, 3]) {
        const thickness = thicknessPixels(width, ratio);
        assert.deepStrictEqual(
          cursorBox(cell, 'underline', width, ratio),
          {
            left: cell.left,
            top: cell.top + cell.height - thickness,
            width: cell.width,
            height: thickness,
            edges: undefined,
          },
          `underline ${width} at ${ratio}`,
        );
        const roomy = { ...cell, width: 30 };
        assert.deepStrictEqual(
          cursorBox(roomy, 'outline', width, ratio),
          {
            ...roomy,
            edges: {
              top: thickness,
              right: thickness,
              bottom: thickness,
              left: thickness,
            },
          },
          `outline ${width} at ${ratio}`,
        );
      }
    }
    assert.deepStrictEqual(cursorBox(cell, 'outline', 10, 1).edges, {
      top: 10,
      right: 4,
      bottom: 10,
      left: 4,
    });
  });

  test('puts a box given in CSS pixels on whole device pixels, its right and bottom edges rounded on their own', () => {
    assert.deepStrictEqual(
      pixelBox({ left: 72.1, top: 28.7, width: 7.2, height: 18.4 }, 1.25),
      { left: 90, top: 36, width: 9, height: 23 },
    );
    assert.deepStrictEqual(
      pixelBox({ left: 10, top: 20, width: 7.5, height: 18 }, 1),
      { left: 10, top: 20, width: 8, height: 18 },
    );
  });

  test('rounds an edge on half a device pixel up, as the browser snaps the 64ths of a device pixel it lays out in, though its CSS pixels fall a float short of the half', () => {
    const left = 348.3999938964844;
    const top = 588.3999938964844;
    assert.ok(left * 1.25 < 435.5 && top * 1.25 < 735.5);
    assert.deepStrictEqual(
      pixelBox({ left, top, width: 7.200000762939453, height: 17.6 }, 1.25),
      { left: 436, top: 736, width: 9, height: 22 },
    );
  });

  test('places a box of device pixels in CSS pixels from the origin of the element holding it', () => {
    assert.deepStrictEqual(
      placedBox({ left: 90, top: 35, width: 10, height: 25 }, 1.25, {
        left: 10.5,
        top: 4.25,
      }),
      { left: 61.5, top: 23.75, width: 8, height: 20 },
    );
  });

  test('blinks at the interval of the WebGL renderer of xterm.js, read from its source, restarting on the other of two animations', () => {
    const source = fs.readFileSync(
      path.join(
        createRequire(__filename).resolve('@xterm/addon-webgl/package.json'),
        '..',
        'src',
        'CursorBlinkStateManager.ts',
      ),
      'utf8',
    );
    assert.match(
      source,
      new RegExp(`const BLINK_INTERVAL = ${cursorBlinkInterval};`),
    );
    assert.strictEqual(
      blinkAnimation(false),
      `cursor-blink ${2 * cursorBlinkInterval}ms steps(1) infinite`,
    );
    assert.strictEqual(
      blinkAnimation(true),
      `cursor-blink-again ${2 * cursorBlinkInterval}ms steps(1) infinite`,
    );
  });

  test('draws a block over the cell of the character, the character in it in the font of the text, where the line draws it', () => {
    assert.deepStrictEqual(
      drawnCursor({
        cell: { left: 72.1, top: 28.1, width: 8, height: 20 },
        text: 'x',
        shape: 'block',
        thickness: 2,
        ratio: 1.25,
        origin: { left: 10, top: 20 },
        font: '12px Mono',
      }),
      {
        box: { left: 62, top: 8, width: 8, height: 20 },
        edges: undefined,
        glyph: {
          text: 'x',
          left: 72.1 - 72,
          top: 28.1 - 28,
          height: 20,
          font: '12px Mono',
        },
      },
    );
  });

  test('draws no character in a bar, an underline or an outline, and the edges of an outline in CSS pixels', () => {
    assert.deepStrictEqual(drawn('bar').box, {
      left: 80,
      top: 40,
      width: 2,
      height: 20,
    });
    assert.deepStrictEqual(drawn('underline').box, {
      left: 80,
      top: 58,
      width: 8,
      height: 2,
    });
    assert.deepStrictEqual(drawn('outline').edges, {
      top: 2,
      right: 2,
      bottom: 2,
      left: 2,
    });
    for (const shape of ['bar', 'underline', 'outline'] as const) {
      assert.strictEqual(drawn(shape).glyph, undefined, shape);
    }
  });
});
