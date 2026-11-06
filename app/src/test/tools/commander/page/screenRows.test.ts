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

const wide = {
  char: 10,
  of: (cluster: string) => (/[中文]/.test(cluster) ? 20 : 10),
};

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
        hanging: [],
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
        hanging: [],
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

  test('indents the rows a line wraps onto as far as the line, and marks where each wrapped row ends and the spaces hanging there, one column past the last at most, with room for both kept after the last column, as the diff draws them', () => {
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
      [5, undefined],
    );
    assert.deepStrictEqual(
      screenRows([indented], 9, 'utf-8').map((row) => row.hanging),
      [[{ column: 7, tab: false }], [{ column: 7, tab: false }], []],
    );
    assert.deepStrictEqual(
      screenRows([hanging], 4, 'utf-8').map((row) => row.hanging),
      [
        [
          { column: 3, tab: false },
          { column: 4, tab: false },
        ],
        [],
      ],
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

  test('wraps the rows read once for as many as ask for them in the same columns, encoding and widths, as rows of megabyte lines take long to wrap', () => {
    const rows = [{ start: 0, end: 12, text: 'one two three' }];
    const wrapped = screenRows(rows, 6, 'utf-8');

    assert.strictEqual(screenRows(rows, 6, 'utf-8'), wrapped);
    assert.notStrictEqual(screenRows(rows, 7, 'utf-8'), wrapped);
    assert.notStrictEqual(screenRows(rows, 6, 'windows-1252'), wrapped);
    assert.notStrictEqual(screenRows([...rows], 6, 'utf-8'), wrapped);
    assert.notStrictEqual(screenRows(rows, 6, 'utf-8', wide), wrapped);
  });

  test('wraps a row by how wide its characters are drawn once measured, as the diff does, marking where each row ends and the spaces hanging there by those widths', () => {
    const rows = [{ start: 0, end: 30, text: '中文 中文中文' }];
    assert.deepStrictEqual(
      screenRows(rows, 6, 'utf-8', wide).map(
        ({ from, to, breakAt, hanging }) => [from, to, breakAt, hanging],
      ),
      [
        [0, 3, 5, [{ column: 4, tab: false }]],
        [3, 6, 6, []],
        [6, 7, undefined, []],
      ],
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
