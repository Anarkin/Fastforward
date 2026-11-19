import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { nextSlots, type RowSlots } from '../../../../lib/page/rowSlots';

const drawn = (previous: RowSlots, keys: readonly string[]) => [
  ...nextSlots(previous, keys),
];

suite('Row slots', () => {
  test('hands the rows that take the place of every row drawn the elements of those, in their order, so a list dragged by its scrollbar or paged down writes a new text into each element rather than take every row out of the page and put another in, which took 0.6 ms of each step of a folder of 20,000 files; rows beyond those there were get elements of their own, and those of rows no longer wanted are let go', () => {
    const first = nextSlots(new Map(), ['a', 'b', 'c']);
    assert.deepStrictEqual(
      [...first],
      [
        ['a', 0],
        ['b', 1],
        ['c', 2],
      ],
    );
    assert.deepStrictEqual(drawn(first, ['d', 'e', 'f']), [
      ['d', 0],
      ['e', 1],
      ['f', 2],
    ]);
    assert.deepStrictEqual(drawn(first, ['d', 'e']), [
      ['d', 0],
      ['e', 1],
    ]);
    assert.deepStrictEqual(drawn(first, ['d', 'e', 'f', 'g']), [
      ['d', 0],
      ['e', 1],
      ['f', 2],
      ['g', 3],
    ]);
    assert.deepStrictEqual(drawn(first, []), []);
  });

  test('keeps each row that stays on the element it has, and gives a row that comes among them an element of its own rather than that of a row that left, so the elements stay in the order of their rows and the page moves none of them, as a list scrolled a few rows up would have had every row that stayed moved after those that came', () => {
    const first = nextSlots(new Map(), ['a', 'b', 'c']);
    const down = nextSlots(first, ['b', 'c', 'd']);
    assert.deepStrictEqual(
      [...down],
      [
        ['b', 1],
        ['c', 2],
        ['d', 3],
      ],
    );
    const up = nextSlots(down, ['a', 'b', 'c']);
    assert.deepStrictEqual(
      [...up],
      [
        ['a', 4],
        ['b', 1],
        ['c', 2],
      ],
    );
    assert.deepStrictEqual(drawn(up, ['x', 'y', 'z']), [
      ['x', 4],
      ['y', 1],
      ['z', 2],
    ]);
    assert.deepStrictEqual(drawn(up, ['c', 'b', 'a']), [
      ['c', 2],
      ['b', 1],
      ['a', 4],
    ]);
  });
});
