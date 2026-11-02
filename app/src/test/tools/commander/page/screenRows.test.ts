import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  firstOf,
  marksWithin,
  piecesWithin,
  rowWithByte,
  rowWithChar,
  screenRows,
} from '../../../../tools/commander/page/screenRows';

const spans = (
  row: { start: number; end: number; text: string },
  encoding: Parameters<typeof screenRows>[2],
) =>
  screenRows([row], 6, encoding).map(({ start, end, from, to }) => [
    start,
    end,
    from,
    to,
  ]);

suite('Rows of a file viewed as the screen shows them', () => {
  test('shows each row read as one while lines are not wrapped', () => {
    const rows = [
      { start: 0, end: 4, text: 'one' },
      { start: 4, end: 8, text: 'two' },
    ];

    assert.deepStrictEqual(screenRows(rows, undefined, 'utf-8'), [
      {
        start: 0,
        end: 4,
        row: rows[0],
        index: 0,
        from: 0,
        to: 3,
        indent: 0,
        breakAt: undefined,
      },
      {
        start: 4,
        end: 8,
        row: rows[1],
        index: 1,
        from: 0,
        to: 3,
        indent: 0,
        breakAt: undefined,
      },
    ]);
  });

  test('wraps each row read onto as many as the columns need, as the diff wraps lines, starting each by the bytes the characters before it take in the encoding read', () => {
    assert.deepStrictEqual(
      spans({ start: 100, end: 114, text: 'héllo wörld' }, 'utf-8'),
      [
        [100, 107, 0, 6],
        [107, 114, 6, 11],
      ],
    );
    assert.deepStrictEqual(
      spans({ start: 100, end: 124, text: 'héllo wörld' }, 'utf-16le'),
      [
        [100, 112, 0, 6],
        [112, 124, 6, 11],
      ],
    );
    assert.deepStrictEqual(
      spans({ start: 100, end: 112, text: 'héllo wörld' }, 'windows-1250'),
      [
        [100, 106, 0, 6],
        [106, 112, 6, 11],
      ],
    );
  });

  test('indents the rows a line wraps onto as far as the line, and marks where each wrapped row ends, at the last column at most, though the spaces hanging at its end go past it', () => {
    const indented = { start: 0, end: 17, text: '    one two three' };
    const hanging = { start: 0, end: 13, text: 'abc      def' };

    assert.deepStrictEqual(
      screenRows([indented], 9, 'utf-8').map(({ from, indent, breakAt }) => [
        from,
        indent,
        breakAt,
      ]),
      [
        [0, 0, 8],
        [8, 4, 8],
        [12, 4, undefined],
      ],
    );
    assert.deepStrictEqual(
      screenRows([hanging], 4, 'utf-8').map(({ breakAt }) => breakAt),
      [4, undefined],
    );
  });

  test('marks the end of a row read cut short of its line as wrapped too, and indents none of the rows the row after it wraps onto by its own spaces, as they are not where its line starts', () => {
    const rows = screenRows(
      [
        { start: 0, end: 4, text: 'abcd', cut: true },
        { start: 4, end: 16, text: '    klm nop' },
      ],
      6,
      'utf-8',
    );

    assert.deepStrictEqual(
      rows.map(({ from, indent, breakAt }) => [from, indent, breakAt]),
      [
        [0, 0, 4],
        [0, 0, 4],
        [4, 0, 4],
        [8, 0, undefined],
      ],
    );
    assert.strictEqual(
      screenRows(
        [{ start: 0, end: 4, text: 'abcd', cut: true }],
        undefined,
        'utf-8',
      )[0]?.breakAt,
      undefined,
    );
  });

  test('finds the first row on screen of a row read, and the one that holds a character or a byte of it, never one of the next row read', () => {
    const rows = screenRows(
      [
        { start: 0, end: 18, text: '    one two three' },
        { start: 18, end: 22, text: 'end' },
      ],
      9,
      'utf-8',
    );

    assert.deepStrictEqual(
      [firstOf(rows, 0), firstOf(rows, 1), firstOf(rows, 2)],
      [0, 3, 4],
    );
    assert.deepStrictEqual(
      [0, 7, 8, 11, 12, 99].map((char) => rowWithChar(rows, 0, char)),
      [0, 0, 1, 1, 2, 2],
    );
    assert.deepStrictEqual(
      [0, 11, 12, 17, 18].map((byte) => rowWithByte(rows, 0, byte)),
      [0, 1, 2, 2, 2],
    );
    assert.strictEqual(rowWithByte(rows, 3, 20), 3);
  });

  test('cuts the colored pieces and the marks of a row read to the part of it a row on screen shows', () => {
    assert.deepStrictEqual(
      piecesWithin(
        [
          { text: 'const ' },
          { text: 'name', kind: 'function' },
          { text: ' = 1' },
        ],
        4,
        12,
      ),
      [{ text: 't ' }, { text: 'name', kind: 'function' }, { text: ' =' }],
    );
    assert.deepStrictEqual(
      marksWithin(
        [
          { start: 0, end: 3, current: false },
          { start: 2, end: 8, current: true },
          { start: 12, end: 14, current: false },
        ],
        4,
        12,
      ),
      [{ start: 0, end: 4, current: true }],
    );
  });
});
