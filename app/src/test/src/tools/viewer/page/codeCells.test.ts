import { strings } from '../../../../../lib/shared/strings';
import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  codeRows,
  lineSegments,
} from '../../../../../tools/viewer/page/codeCells';

suite('Code blocks drawn as cells', () => {
  test('makes a row of each line of a code block, each starting after the line break of the one before, an empty line a row of its own and the line break ending the block none', () => {
    assert.deepStrictEqual(
      codeRows('const one = 1;\n\nlast\n').map(({ start, end, row, to }) => [
        start,
        end,
        row.text,
        to,
      ]),
      [
        [0, 15, 'const one = 1;', 14],
        [15, 16, '', 0],
        [16, 21, 'last', 4],
      ],
    );
    assert.deepStrictEqual(
      codeRows('').map(({ row }) => row.text),
      [''],
    );
  });

  test('ends each line of a code block followed by a line break with it, so the cells sign it while whitespace is shown as they sign the lines of a file viewed, and the last line of a block not ended by one with none', () => {
    const lineFeed = strings.symbols.lineFeed;
    assert.deepStrictEqual(
      codeRows('one\n\nlast\n').map(({ row }) => row.ending),
      [lineFeed, lineFeed, lineFeed],
    );
    assert.deepStrictEqual(
      codeRows('one\nlast').map(({ row }) => row.ending),
      [lineFeed, undefined],
    );
  });

  test('gives each row of a code block the colored pieces of its own line, and none to a row it has not', () => {
    const rows = codeRows('const one = 1;\nlast');
    const segmentsOf = lineSegments(rows, [
      [
        { start: 0, end: 5, kind: 'keyword' },
        { start: 12, end: 13, kind: 'number' },
      ],
      [],
    ]);

    assert.deepStrictEqual(
      [
        segmentsOf(rows[0].row),
        segmentsOf(rows[1].row),
        segmentsOf({ start: 99, end: 100, text: 'other' }),
      ],
      [
        [
          { text: 'const', kind: 'keyword' },
          { text: ' one = ' },
          { text: '1', kind: 'number' },
          { text: ';' },
        ],
        [{ text: 'last' }],
        undefined,
      ],
    );
  });
});
