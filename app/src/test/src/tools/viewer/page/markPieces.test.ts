import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  byteMarks,
  hexLineMarks,
  hexMarks,
  markPieces,
  occurrenceMarks,
  occurrencesOf,
  textMarks,
} from '../../../../../tools/viewer/page/markPieces';
import { plainSearch } from '../../../../../lib/shared/searchOptions';

suite('Matches marked in a file viewed', () => {
  test('marks every copy of the text selected in a row, in its case and inside longer words too, as occurrences, and nothing without a text selected', () => {
    assert.deepStrictEqual(
      occurrenceMarks('total subtotal Total total', 'total'),
      [
        { start: 0, end: 5, current: false, occurrence: true },
        { start: 9, end: 14, current: false, occurrence: true },
        { start: 21, end: 26, current: false, occurrence: true },
      ],
    );
    assert.deepStrictEqual(occurrenceMarks('total', undefined), []);
  });

  test('gives a row the same occurrences while the same text stays selected, so a row drawn before is not drawn again as the view scrolls', () => {
    const copiesIn = occurrencesOf('a');
    const first = copiesIn('a b a');
    assert.strictEqual(copiesIn('a b a'), first);
    assert.deepStrictEqual(first, occurrenceMarks('a b a', 'a'));
    assert.notStrictEqual(occurrencesOf('a')('a b a'), first);
  });

  test('cuts the pieces of a row at its occurrences as at its matches, so each is drawn as an occurrence', () => {
    assert.deepStrictEqual(
      markPieces([{ text: 'ab ab' }], occurrenceMarks('ab ab', 'ab')).map(
        ({ text, mark }) => [text, mark],
      ),
      [
        ['ab', 'occurrence'],
        [' ', undefined],
        ['ab', 'occurrence'],
      ],
    );
  });

  test('marks the matches of a row of text ignoring case, the one current among them by the bytes it starts at', () => {
    const row = { start: 100, end: 120, text: 'Árvíz árvíz x' };
    const matches = [
      { start: 90, end: 97 },
      { start: 100, end: 107 },
      { start: 108, end: 115 },
    ];

    assert.deepStrictEqual(
      textMarks(row, 'árvíz', plainSearch, matches, matches[2], 'utf-8'),
      [
        { start: 0, end: 5, current: false },
        { start: 6, end: 11, current: true },
      ],
    );
    assert.deepStrictEqual(
      textMarks(row, 'árvíz', plainSearch, matches, matches[0], 'utf-8').map(
        (mark) => mark.current,
      ),
      [false, false],
    );
    assert.deepStrictEqual(
      textMarks(row, '', plainSearch, matches, matches[1], 'utf-8'),
      [],
    );
  });

  test('marks a match across the cut of a line too long to keep whole in both rows of it, current or not, by the bytes it takes, as it was marked in neither', () => {
    const cut = { start: 0, end: 6, text: 'aé ne', cut: true as const };
    const rest = { start: 6, end: 18, text: 'edle needle' };
    const matches = [
      { start: 4, end: 10 },
      { start: 11, end: 17 },
    ];

    assert.deepStrictEqual(
      textMarks(cut, 'needle', plainSearch, matches, matches[0], 'utf-8'),
      [{ start: 3, end: 5, current: true }],
    );
    assert.deepStrictEqual(
      textMarks(rest, 'needle', plainSearch, matches, matches[0], 'utf-8'),
      [
        { start: 0, end: 4, current: true },
        { start: 5, end: 11, current: false },
      ],
    );
    assert.deepStrictEqual(
      textMarks(rest, 'needle', plainSearch, matches, matches[1], 'utf-8'),
      [
        { start: 0, end: 4, current: false },
        { start: 5, end: 11, current: true },
      ],
    );
    assert.deepStrictEqual(
      textMarks(
        { start: 2, end: 4, text: 'aa' },
        'aa',
        plainSearch,
        [{ start: 1, end: 3 }],
        undefined,
        'utf-8',
      ),
      [{ start: 0, end: 1, current: false }],
    );
    assert.deepStrictEqual(
      [
        textMarks(
          { start: 0, end: 10, text: 'ab ne' },
          'needle',
          plainSearch,
          [{ start: 6, end: 18 }],
          undefined,
          'utf-16le',
        ),
        textMarks(
          { start: 10, end: 20, text: 'edle' },
          'needle',
          plainSearch,
          [{ start: 6, end: 18 }],
          undefined,
          'utf-16le',
        ),
      ],
      [
        [{ start: 3, end: 5, current: false }],
        [{ start: 0, end: 4, current: false }],
      ],
    );
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

  test('marks the bytes found in a row of hex twice, on their pairs of digits and on their characters, each from where its column starts in the line', () => {
    assert.deepStrictEqual(
      hexLineMarks(
        [
          { start: 0, end: 2, current: false },
          { start: 15, end: 16, current: true },
        ],
        11,
        62,
      ),
      [
        { start: 11, end: 16, current: false },
        { start: 57, end: 59, current: true },
        { start: 62, end: 64, current: false },
        { start: 77, end: 78, current: true },
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

  test('marks the whole of a character of several code points a match starts or ends inside, as the accent left of a decomposed é or the rest of a keycap after its digit was drawn apart from it, a column further on', () => {
    assert.deepStrictEqual(
      markPieces(
        [{ text: 'Café 1️⃣ é' }],
        [
          { start: 0, end: 4, current: true },
          { start: 6, end: 7, current: false },
          { start: 10, end: 11, current: false },
        ],
      ),
      [
        { text: 'Café', kind: undefined, mark: 'current' },
        { text: ' ', kind: undefined, mark: undefined },
        { text: '1️⃣', kind: undefined, mark: 'match' },
        { text: ' ', kind: undefined, mark: undefined },
        { text: 'é', kind: undefined, mark: 'match' },
      ],
    );
  });
});
