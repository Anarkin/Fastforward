import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  firstFrom,
  screenMatches,
} from '../../../../../tools/terminal/page/screenFind';
import { plainSearch } from '../../../../../lib/shared/searchOptions';

const cellsOf = (text: string) =>
  Array.from(text).flatMap((char) =>
    char === '界'
      ? [
          { chars: char, width: 2 },
          { chars: '', width: 0 },
        ]
      : [{ chars: char, width: 1 }],
  );

const bufferOf = (rows: readonly (readonly [string, boolean?])[]) => ({
  length: rows.length,
  getLine: (y: number) => {
    const row = rows[y];
    if (row === undefined) {
      return undefined;
    }
    const cells = cellsOf(row[0]);
    return {
      isWrapped: row[1] === true,
      length: cells.length,
      getCell: (x: number) => {
        const cell = cells[x];
        return cell === undefined
          ? undefined
          : { getChars: () => cell.chars, getWidth: () => cell.width };
      },
    };
  },
});

suite('Finding in the terminal', () => {
  test('finds a text in the rows of the screen and the scrollback, each match the cells it covers, a wide character two of them', () => {
    assert.deepStrictEqual(
      screenMatches(
        bufferOf([['npm run build'], ['界 build failed']]),
        'build',
        plainSearch,
      ),
      [[{ row: 0, column: 8, width: 5 }], [{ row: 1, column: 3, width: 5 }]],
    );
  });

  test('finds across the break of a line the terminal wrapped, as one match on the cells of both rows, but never across two lines', () => {
    assert.deepStrictEqual(
      screenMatches(
        bufferOf([['abc bui'], ['ld', true], ['bui'], ['ld']]),
        'build',
        plainSearch,
      ),
      [
        [
          { row: 0, column: 4, width: 3 },
          { row: 1, column: 0, width: 2 },
        ],
      ],
    );
  });

  test('takes the toggles every search of the app takes, case, whole words and patterns', () => {
    const buffer = bufferOf([['Build builds build']]);
    assert.deepStrictEqual(
      [
        screenMatches(buffer, 'build', { ...plainSearch, caseSensitive: true })
          .length,
        screenMatches(buffer, 'build', { ...plainSearch, wholeWord: true })
          .length,
        screenMatches(buffer, 'b.ild', { ...plainSearch, regex: true }).length,
      ],
      [2, 2, 3],
    );
  });

  test('stops at the most matches it marks', () => {
    assert.strictEqual(
      screenMatches(bufferOf([['a a a a']]), 'a', plainSearch, 3).length,
      3,
    );
  });

  test('starts at the first match from a place on, the top of the screen as a search starts or the match shown as output arrives, and at the first match past the last', () => {
    const matches = [
      [{ row: 2, column: 4, width: 1 }],
      [{ row: 5, column: 0, width: 1 }],
      [{ row: 5, column: 9, width: 1 }],
    ];
    assert.deepStrictEqual(
      [
        firstFrom(matches, 0, 0),
        firstFrom(matches, 3, 0),
        firstFrom(matches, 5, 9),
        firstFrom(matches, 9, 0),
        firstFrom([], 0, 0),
      ],
      [0, 1, 2, 0, 0],
    );
  });
});
