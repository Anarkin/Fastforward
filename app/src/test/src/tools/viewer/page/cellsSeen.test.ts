import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { packedPart } from '../../../../../components/syntax/page/parts';
import type { ShownRows } from '../../../../../tools/viewer/page/cellPainting';
import { seenRows } from '../../../../../tools/viewer/page/cellsSeen';
import type { ScreenRow } from '../../../../../tools/viewer/page/screenRows';
import {
  coloredText,
  withPart,
} from '../../../../../tools/viewer/page/textColors';
import { widths } from './cellFixtures';

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

suite('Rows the cells show, told when asked', () => {
  test('tells of each row drawn its text, the kinds of code in it and where its line breaks or goes on, so a test reads what the cells show though no element holds it', () => {
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
      ),
      [
        {
          key: '0:0',
          text: 'const ',
          column: 0,
          kinds: ['keyword', 'plain'],
          marks: [],
          selected: undefined,
          breakAt: 6,
          continues: true,
        },
        {
          key: '0:6',
          text: 'one',
          column: 0,
          kinds: ['plain'],
          marks: [],
          selected: undefined,
          breakAt: undefined,
          continues: false,
        },
        {
          key: '10:0',
          text: 'last',
          column: 0,
          kinds: ['plain'],
          marks: [],
          selected: undefined,
          breakAt: undefined,
          continues: false,
        },
      ],
    );
  });

  test('tells what a find found, the find the search is at, the occurrences of a selection and what is selected, each counted from the first character of the part of the row shown, which starts at its column', () => {
    const row = rowOf('one two one two', 0);

    const [seen] = seenRows(
      shown([row], {
        parts: [{ from: 4, to: 15, column: 4 }],
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
    );

    assert.deepStrictEqual(
      [seen.text, seen.column, seen.marks, seen.selected],
      [
        'two one two',
        4,
        [
          { from: 0, to: 3, name: 'current' },
          { from: 4, to: 7, name: 'occurrence' },
        ],
        { from: 8, to: 11 },
      ],
    );
  });
});
