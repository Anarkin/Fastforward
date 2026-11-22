import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { packedPart } from '../../../../../components/syntax/page/parts';
import { CellFrame } from '../../../../../tools/viewer/page/cellFrame';
import {
  cellPainting,
  paintRows,
  type ShownRows,
} from '../../../../../tools/viewer/page/cellPainting';
import {
  seenDots,
  seenGlyphs,
  seenRows,
} from '../../../../../tools/viewer/page/cellsSeen';
import { paletteOf } from '../../../../../tools/viewer/page/textCells';
import type { ScreenRow } from '../../../../../tools/viewer/page/screenRows';
import {
  coloredText,
  withPart,
} from '../../../../../tools/viewer/page/textColors';
import { fakePainter, look, tilesWith, widths } from './cellFixtures';

function rowOf(text: string, start: number, more: Partial<ScreenRow> = {}) {
  const row: ScreenRow = {
    start,
    end: start + text.length + 1,
    row: { start, end: start + text.length + 1, text },
    index: 0,
    from: 0,
    to: text.length,
    indent: 0,
    breakAt: undefined,
    hanging: [],
    ...more,
  };
  return row;
}

function shown(
  rows: readonly ScreenRow[],
  more: Partial<ShownRows> = {},
): ShownRows {
  return {
    rows,
    parts: rows.map(() => undefined),
    wrapAt: undefined,
    colored: undefined,
    marksOf: () => [],
    showWhitespace: false,
    widths,
    first: 0,
    ...more,
  };
}

const place = { left: 100, top: 50, advance: 7, rowHeight: 18 };

const placed = (row: number, column = 0) => ({
  left: 100 + column * 7,
  top: 50 + row * 18,
  height: 18,
  advance: 7,
});

suite('Rows the cells show, told when asked', () => {
  test('tells of each row drawn its text, where on the page it stands and how wide its cells are, the pieces of code in it with their kinds and where its line breaks or goes on, so a test reads what the cells show though no element holds it', () => {
    const colored = withPart(
      coloredText('const one\nlast\n', 'utf-8', false),
      packedPart([[{ start: 0, end: 5, kind: 'keyword' }], [], []], 0, true),
    );
    const line = rowOf('const one', 0);

    assert.deepStrictEqual(
      seenRows(
        shown(
          [
            { ...line, to: 6, breakAt: 6 },
            { ...line, from: 6, index: 1 },
            rowOf('last', 10),
          ],
          { colored },
        ),
        place,
      ),
      [
        {
          key: '0:0',
          text: 'const ',
          column: 0,
          ...placed(0),
          pieces: [
            { text: 'const', kind: 'keyword' },
            { text: ' ', kind: 'plain' },
          ],
          marks: [],
          selected: undefined,
          breakAt: 6,
          continues: true,
        },
        {
          key: '0:6',
          text: 'one',
          column: 0,
          ...placed(1),
          pieces: [{ text: 'one', kind: 'plain' }],
          marks: [],
          selected: undefined,
          breakAt: undefined,
          continues: false,
        },
        {
          key: '10:0',
          text: 'last',
          column: 0,
          ...placed(2),
          pieces: [{ text: 'last', kind: 'plain' }],
          marks: [],
          selected: undefined,
          breakAt: undefined,
          continues: false,
        },
      ],
    );
  });

  test('tells what a find found, the find the search is at, the occurrences of a selection and what is selected, each counted from the first character of the part of the row shown, which starts at its column, as many cells after the first column the canvas shows', () => {
    const row = rowOf('one two one two', 0);

    const [seen] = seenRows(
      shown([row], {
        parts: [{ from: 4, to: 15, column: 4 }],
        first: 1,
        marksOf: () => [
          { start: 0, end: 3, current: false },
          { start: 4, end: 7, current: true },
          { start: 8, end: 11, current: false, occurrence: true },
        ],
        selection: {
          anchor: { start: 0, char: 12 },
          focus: { start: 0, char: 15 },
        },
      }),
      place,
    );

    assert.deepStrictEqual(
      [seen.text, seen.column, seen.left, seen.marks, seen.selected],
      [
        'two one two',
        4,
        121,
        [
          { from: 0, to: 3, name: 'current' },
          { from: 4, to: 7, name: 'occurrence' },
        ],
        { from: 8, to: 11 },
      ],
    );
  });

  test('tells where the frame draws a glyph, the row and the column of each cell it is put in, in whatever color, counted from the first column of the text though the canvas starts further on, so a test sees what the cells draw line up', () => {
    const tiles = tilesWith(fakePainter());
    const cells = cellPainting(tiles, new CellFrame(), paletteOf(look), {
      size: 2,
      left: 2,
      top: 7,
      hairline: 1,
    });
    const colored = withPart(
      coloredText('ab|\n中|a\n', 'utf-8', false),
      packedPart([[], [{ start: 0, end: 4, kind: 'keyword' }], []], 0, true),
    );
    const rows = [rowOf('ab|', 0), rowOf('中|a', 4)];

    paintRows(cells, shown(rows, { colored, first: 1 }), Infinity);

    assert.deepStrictEqual(seenGlyphs(cells.frame, tiles, '|', 1), [
      { row: 0, column: 2 },
      { row: 1, column: 2 },
    ]);
    assert.deepStrictEqual(seenGlyphs(cells.frame, tiles, '中', 1), [
      { row: 1, column: 0 },
    ]);
    assert.deepStrictEqual(seenGlyphs(cells.frame, tiles, 'z', 1), []);
  });

  test('tells where the frame dots a space, the row and the column of each, and none of the grounds laid under what is selected, so a test sees whitespace shown and hidden', () => {
    const tiles = tilesWith(fakePainter());
    const cells = cellPainting(tiles, new CellFrame(), paletteOf(look), {
      size: 2,
      left: 2,
      top: 7,
      hairline: 1,
    });
    const rows = [rowOf('a b', 0), rowOf(' cd ', 4)];
    const selection = {
      anchor: { start: 0, char: 0 },
      focus: { start: 4, char: 2 },
    };

    paintRows(
      cells,
      shown(rows, { showWhitespace: true, first: 1, selection }),
      Infinity,
    );

    assert.deepStrictEqual(seenDots(cells, 1), [
      { row: 0, column: 1 },
      { row: 1, column: 0 },
      { row: 1, column: 3 },
    ]);

    paintRows(cells, shown(rows, { first: 1, selection }), Infinity);

    assert.deepStrictEqual(seenDots(cells, 1), []);
  });
});
