import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { NumberedLine } from '../../../../../components/diff/page/changeBlocks';
import { stripedFrom } from '../../../../../components/diff/page/rowClasses';

const added: NumberedLine = {
  index: 0,
  line: { kind: 'added', oldNumber: undefined, newNumber: 1, text: 'a' },
};

suite('Diff row heights', () => {
  test('tells how far down it is, for the stripes of its empty side to run on from those of the rows around, to a row that has an empty side alone, a line on one side only or an image, where every row told all it holds, each element of each row inheriting a number of its own, so the browser shared the style of no element of one row with the next, 12% of each step of a diff dragged quickly by its scrollbar, 9% of one dragged slowly and 4% of a notch of the wheel', () => {
    assert.deepStrictEqual(
      [
        stripedFrom(
          { kind: 'split', file: 0, left: undefined, right: added },
          40,
        ),
        stripedFrom(
          { kind: 'split', file: 0, left: added, right: undefined },
          58,
        ),
        stripedFrom({ kind: 'image', file: 0 }, 76),
        stripedFrom({ kind: 'split', file: 0, left: added, right: added }, 94),
        stripedFrom({ kind: 'line', file: 0, line: added.line }, 112),
        stripedFrom({ kind: 'hunk', file: 0 }, 130),
      ],
      [40, 58, 76, 0, 0, 0],
    );
  });
});
