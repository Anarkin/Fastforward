import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  cellBox,
  cursorCellOf,
  drawnByPage,
  gridOf,
  programCursor,
  setsCursorMode,
} from '../../../../../tools/terminal/page/pageCursor';

const buffer = (
  at: { x: number; y: number; base: number; viewport: number },
  width = 1,
) => ({
  cursorX: at.x,
  cursorY: at.y,
  baseY: at.base,
  viewportY: at.viewport,
  getLine: () => ({ getCell: () => ({ getWidth: () => width }) }),
});

suite('Cursor the page draws over the terminal', () => {
  test('outlines the cell of the cursor where the screen shows it, two cells wide on a wide character, and none while the screen is scrolled away from it', () => {
    assert.deepStrictEqual(
      cursorCellOf(buffer({ x: 3, y: 5, base: 100, viewport: 100 }), 80, 24),
      { column: 3, row: 5, cells: 1 },
    );
    assert.deepStrictEqual(
      cursorCellOf(buffer({ x: 3, y: 5, base: 100, viewport: 98 }, 2), 80, 24),
      { column: 3, row: 7, cells: 2 },
    );
    assert.strictEqual(
      cursorCellOf(buffer({ x: 3, y: 5, base: 100, viewport: 60 }), 80, 24),
      undefined,
    );
  });

  test('outlines the last column for a cursor past the end of a row, waiting to wrap, as xterm.js draws it there', () => {
    assert.deepStrictEqual(
      cursorCellOf(buffer({ x: 80, y: 5, base: 0, viewport: 0 }), 80, 24),
      { column: 79, row: 5, cells: 1 },
    );
  });

  test('places the cell on the screen by the size of its columns and rows', () => {
    assert.deepStrictEqual(
      cellBox({ left: 10, top: 20, width: 720, height: 432 }, 80, 24, {
        column: 3,
        row: 5,
        cells: 2,
      }),
      { left: 37, top: 110, width: 18, height: 18 },
    );
  });

  test('draws the underline and the outline itself, as xterm.js draws its underline a CSS pixel thick and an outline only without the focus, leaving the block and the bar to xterm.js', () => {
    assert.deepStrictEqual(
      ['block', 'bar', 'underline', 'outline'].filter((style) =>
        drawnByPage(style),
      ),
      ['underline', 'outline'],
    );
  });

  test('follows a program setting the style of the cursor and its blinking as xterm.js does, the settings again on 0 or no parameter, which xterm.js reads as 0, and only the blinking past 6', () => {
    assert.strictEqual(programCursor([]), 'reset');
    assert.strictEqual(programCursor([0]), 'reset');
    assert.deepStrictEqual(
      [1, 2, 3, 4, 5, 6].map((param) => programCursor([param])),
      [
        { style: 'block', blink: true },
        { style: 'block', blink: false },
        { style: 'underline', blink: true },
        { style: 'underline', blink: false },
        { style: 'bar', blink: true },
        { style: 'bar', blink: false },
      ],
    );
    assert.deepStrictEqual(programCursor([7]), {
      style: undefined,
      blink: true,
    });
  });

  test('places the cells by the size of the canvas in device pixels, which xterm.js lays its rows out by, rather than by its screen, which it rounds to whole CSS pixels', () => {
    assert.deepStrictEqual(
      gridOf(
        { left: 10, top: 20, width: 600, height: 691 },
        { width: 900, height: 1036 },
        1.5,
      ),
      { left: 10, top: 20, width: 600, height: 1036 / 1.5 },
    );
    assert.deepStrictEqual(
      gridOf({ left: 10, top: 20, width: 600, height: 691 }, undefined, 1.5),
      { left: 10, top: 20, width: 600, height: 691 },
    );
  });

  test('follows a program showing and hiding the cursor by its mode alone', () => {
    assert.strictEqual(setsCursorMode([25]), true);
    assert.strictEqual(setsCursorMode([1049, 25]), true);
    assert.strictEqual(setsCursorMode([[25]]), true);
    assert.strictEqual(setsCursorMode([1049]), false);
  });
});
