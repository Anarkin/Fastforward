import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  arrowRects,
  lineRects,
  strokeOf,
  type Rect,
} from '../../../../../tools/canvas/page/lineRects';
import { doubleShift, wayBits } from '../../../../../tools/canvas/page/screen';

const cell = { x: 0, y: 0, width: 7, height: 9 };

const { up, right, down, left } = wayBits;

function pixels(rects: readonly Rect[], width = 7, height = 9): string[] {
  const rows = Array.from({ length: height }, () =>
    Array<string>(width).fill('.'),
  );
  for (const each of rects) {
    for (let y = each.y; y < each.y + each.height; y++) {
      for (let x = each.x; x < each.x + each.width; x++) {
        const row = rows[y];
        if (row !== undefined && x >= 0 && x < width) {
          row[x] = '#';
        }
      }
    }
  }
  return rows.map((row) => row.join(''));
}

suite('Canvas lines', () => {
  test('draws a line a device pixel thick, two from a scale of 200%, as the box-drawing characters of the font are as thin', () => {
    assert.deepStrictEqual(
      [1, 1.25, 1.5, 1.75, 2, 3].map(strokeOf),
      [1, 1, 1, 1, 2, 3],
    );
  });

  test('draws light lines from the middle of a cell to its edges, so the lines of neighbouring cells meet', () => {
    assert.deepStrictEqual(
      pixels(lineRects(cell, up | right | down | left, 1)),
      [
        '...#...',
        '...#...',
        '...#...',
        '...#...',
        '#######',
        '...#...',
        '...#...',
        '...#...',
        '...#...',
      ],
    );
    assert.deepStrictEqual(pixels(lineRects(cell, right | down, 1)), [
      '.......',
      '.......',
      '.......',
      '.......',
      '...####',
      '...#...',
      '...#...',
      '...#...',
      '...#...',
    ]);
  });

  test('draws double lines a stroke apart, their corners nested and their joints open where a line comes in', () => {
    assert.deepStrictEqual(
      pixels(lineRects(cell, (right | down) << doubleShift, 1)),
      [
        '.......',
        '.......',
        '.......',
        '..#####',
        '..#....',
        '..#.###',
        '..#.#..',
        '..#.#..',
        '..#.#..',
      ],
    );
    assert.deepStrictEqual(
      pixels(lineRects(cell, ((up | down) << doubleShift) | right, 1)),
      [
        '..#.#..',
        '..#.#..',
        '..#.#..',
        '..#.#..',
        '..#.###',
        '..#.#..',
        '..#.#..',
        '..#.#..',
        '..#.#..',
      ],
    );
  });

  test('draws an arrowhead pointing into a node with its tip on the line of the border in the next cell, its stem from the line coming in', () => {
    const border = lineRects({ ...cell, y: 9 }, left | right, 1);
    assert.deepStrictEqual(
      pixels([...arrowRects(cell, 'down', 1), ...border], 7, 18),
      [
        '...#...',
        '...#...',
        '...#...',
        '...#...',
        '...#...',
        '...#...',
        '...#...',
        '...#...',
        '...#...',
        '...#...',
        '#######',
        '.#####.',
        '..###..',
        '#######',
        '.......',
        '.......',
        '.......',
        '.......',
      ],
    );
  });
});
