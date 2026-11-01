import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  byteMarks,
  hexMarks,
  markPieces,
  textMarks,
} from '../../../../tools/commander/page/findMarks';

suite('Matches marked in a file viewed', () => {
  test('marks the matches of a row of text ignoring case, the one current among them by the bytes it starts at', () => {
    const row = { start: 100, end: 120, text: 'Árvíz árvíz x' };
    const matches = [
      { start: 90, end: 97 },
      { start: 100, end: 107 },
      { start: 108, end: 115 },
    ];

    assert.deepStrictEqual(textMarks(row, 'árvíz', matches, matches[2]), [
      { start: 0, end: 5, current: false },
      { start: 6, end: 11, current: true },
    ]);
    assert.deepStrictEqual(
      textMarks(row, 'árvíz', matches, matches[0]).map((mark) => mark.current),
      [false, false],
    );
    assert.deepStrictEqual(textMarks(row, '', matches, matches[1]), []);
  });

  test('marks the bytes of a row that matches take, cut to the row, and the current one', () => {
    const matches = [
      { start: 2, end: 5 },
      { start: 14, end: 18 },
      { start: 40, end: 41 },
    ];

    assert.deepStrictEqual(byteMarks(0, 16, matches, matches[1]), [
      { start: 2, end: 5, current: false },
      { start: 14, end: 16, current: true },
    ]);
    assert.deepStrictEqual(byteMarks(16, 16, matches, matches[1]), [
      { start: 0, end: 2, current: true },
    ]);
    assert.deepStrictEqual(byteMarks(20, 16, matches, undefined), []);
  });

  test('places the marks of bytes on their pairs of hex digits, past the gap between the halves of a row', () => {
    assert.deepStrictEqual(
      hexMarks([
        { start: 0, end: 2, current: false },
        { start: 7, end: 9, current: true },
        { start: 15, end: 16, current: false },
      ]),
      [
        { start: 0, end: 5, current: false },
        { start: 21, end: 27, current: true },
        { start: 46, end: 48, current: false },
      ],
    );
  });

  test('cuts the colored pieces of a row where marks start and end', () => {
    assert.deepStrictEqual(
      markPieces(
        [
          { text: 'const ', kind: 'keyword' },
          { text: 'value = 1', kind: undefined },
        ],
        [
          { start: 4, end: 8, current: true },
          { start: 14, end: 15, current: false },
        ],
      ),
      [
        { text: 'cons', kind: 'keyword', mark: undefined },
        { text: 't ', kind: 'keyword', mark: 'current' },
        { text: 'va', kind: undefined, mark: 'current' },
        { text: 'lue = ', kind: undefined, mark: undefined },
        { text: '1', kind: undefined, mark: 'match' },
      ],
    );
    assert.deepStrictEqual(markPieces([{ text: 'plain' }], []), [
      { text: 'plain', kind: undefined, mark: undefined },
    ]);
  });
});
