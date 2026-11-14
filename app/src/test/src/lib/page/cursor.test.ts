import * as assert from 'node:assert';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  barPixels,
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

const coveredDown = (start: number, end: number) =>
  Math.floor(end - 0.5) - Math.floor(start - 0.5);

const drawn = (shape: 'bar' | 'underline' | 'outline') =>
  drawnCursor({
    cell: { left: 80, top: 40, width: 8, height: 20 },
    text: 'x',
    shape,
    barWidth: 2,
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
          barPixels(width, ratio),
          Math.max(1, coveredBy(cell.left, cell.left + width * ratio)),
          `${width} at ${ratio}`,
        );
      }
    }
    assert.strictEqual(barPixels(1, 0.5), 1);
  });

  test('draws the underline and the outline as thick as the WebGL renderer of xterm.js, which fills the device pixels whose centers its rectangles of a CSS pixel cover, a center on an edge filled at the left and the bottom, as GL counts up from the bottom', () => {
    for (const ratio of [1, 1.25, 1.5, 1.75, 2, 2.5, 3]) {
      const bottom = cell.top + cell.height;
      const right = cell.left + cell.width;
      const underline = cursorBox(cell, 'underline', 2, ratio);
      assert.deepStrictEqual(
        underline,
        {
          left: cell.left,
          top: bottom - coveredDown(bottom - ratio, bottom),
          width: cell.width,
          height: coveredDown(bottom - ratio, bottom),
          edges: undefined,
        },
        `underline at ${ratio}`,
      );
      assert.deepStrictEqual(
        cursorBox(cell, 'outline', 2, ratio),
        {
          ...cell,
          edges: {
            top: coveredDown(cell.top, cell.top + ratio),
            right: coveredBy(right - ratio, right),
            bottom: coveredDown(bottom - ratio, bottom),
            left: coveredBy(cell.left, cell.left + ratio),
          },
        },
        `outline at ${ratio}`,
      );
    }
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
        barWidth: 2,
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
      top: 59,
      width: 8,
      height: 1,
    });
    assert.deepStrictEqual(drawn('outline').edges, {
      top: 1,
      right: 1,
      bottom: 1,
      left: 1,
    });
    for (const shape of ['bar', 'underline', 'outline'] as const) {
      assert.strictEqual(drawn(shape).glyph, undefined, shape);
    }
  });
});
