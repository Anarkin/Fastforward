import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  arrowRects,
  lineRects,
  strokeOf,
  type Rect,
} from '../../../../../tools/canvas/page/lineRects';
import { wayBits } from '../../../../../tools/canvas/page/screen';

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

  test('draws each arm of a cell as a rect of its own, telling the way it goes, so two lines crossing in a cell keep a color each', () => {
    const arms = lineRects(cell, up | right | down | left, 1);
    assert.deepStrictEqual(
      arms.map((arm) => arm.way),
      ['up', 'down', 'left', 'right'],
    );
    assert.deepStrictEqual(
      pixels(arms.filter((arm) => arm.way === 'left' || arm.way === 'right')),
      [
        '.......',
        '.......',
        '.......',
        '.......',
        '#######',
        '.......',
        '.......',
        '.......',
        '.......',
      ],
    );
    assert.deepStrictEqual(
      pixels(arms.filter((arm) => arm.way === 'up' || arm.way === 'down')),
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
