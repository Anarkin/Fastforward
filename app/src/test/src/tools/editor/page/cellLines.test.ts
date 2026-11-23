import * as assert from 'node:assert';
import { Text } from '@codemirror/state';
import { suite, test } from 'vitest';
import type { ScreenRow } from '../../../../../components/cells/page/lines';
import {
  linesMarked,
  marksOfLine,
  selectionsOf,
} from '../../../../../tools/editor/page/cellLines';
import { mergedMarks } from '../../../../../tools/editor/page/cellMarks';

const rowOf = (start: number, text: string): ScreenRow => ({
  start,
  end: start + 1,
  row: { start, end: start + 1, text },
  index: 0,
  from: 0,
  to: text.length,
  indent: 0,
  breakAt: undefined,
  hanging: [],
});

suite('What the cells show of a text edited', () => {
  test('gives a line the marks that reach into it, counted from its start and cut at its ends, the find the search is at and the copies of a word told apart', () => {
    const marks = [
      { from: 2, to: 4 },
      { from: 8, to: 14, current: true },
      { from: 16, to: 17, occurrence: true as const },
      { from: 30, to: 31 },
    ];

    assert.deepStrictEqual(marksOfLine(marks, 10, 20), [
      { start: 0, end: 4, current: true },
      { start: 6, end: 7, current: false, occurrence: true },
    ]);
    assert.deepStrictEqual(marksOfLine(marks, 20, 30), []);
    assert.deepStrictEqual(marksOfLine([], 0, 10), []);
  });

  test('colors a line by its number and marks it by where it stands in the text, once for a line however often it is asked for, and leaves a line with no colors yet plain', () => {
    const doc = Text.of(['const a = 1;', 'plain', 'b']);
    let asked = 0;
    const { segmentsOf, marksOf } = linesMarked(
      {
        colorsOf: (line) => {
          asked += 1;
          return line === 1 ? [{ start: 0, end: 5, kind: 'keyword' }] : [];
        },
        marks: [{ from: 13, to: 18 }],
      },
      doc,
    );
    const first = rowOf(1, 'const a = 1;');
    const second = rowOf(2, 'plain');

    assert.deepStrictEqual(segmentsOf?.(first.row), [
      { text: 'const', kind: 'keyword' },
      { text: ' a = 1;' },
    ]);
    assert.strictEqual(segmentsOf?.(first.row), segmentsOf?.(first.row));
    assert.strictEqual(segmentsOf?.(second.row), undefined);
    assert.strictEqual(asked, 2);
    assert.deepStrictEqual(marksOf(first), []);
    assert.deepStrictEqual(marksOf(second), [
      { start: 0, end: 5, current: false },
    ]);
    assert.strictEqual(marksOf(second), marksOf(second));
  });

  test('tells each selection by the lines and characters it runs between, whichever way it was dragged, and none for a cursor', () => {
    const doc = Text.of(['abc', 'defg']);

    assert.deepStrictEqual(
      selectionsOf(
        [
          { anchor: 1, head: 6 },
          { anchor: 8, head: 8 },
          { anchor: 7, head: 5 },
        ],
        doc,
      ),
      [
        { anchor: { start: 1, char: 1 }, focus: { start: 2, char: 2 } },
        { anchor: { start: 2, char: 3 }, focus: { start: 2, char: 1 } },
      ],
    );
  });

  test('marks the copies of a word and the brackets of a pair among the finds in the order of the text, leaving out one a find covers, as two marks over one character would draw it twice', () => {
    const finds = [
      { from: 4, to: 8, current: true },
      { from: 20, to: 24 },
    ];

    assert.deepStrictEqual(
      mergedMarks(finds, [
        { from: 0, to: 1 },
        { from: 6, to: 7 },
        { from: 12, to: 13 },
        { from: 30, to: 31 },
      ]),
      [
        { from: 0, to: 1, occurrence: true },
        { from: 4, to: 8, current: true },
        { from: 12, to: 13, occurrence: true },
        { from: 20, to: 24 },
        { from: 30, to: 31, occurrence: true },
      ],
    );
    assert.strictEqual(mergedMarks(finds, []), finds);
  });
});
