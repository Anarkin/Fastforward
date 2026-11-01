import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  coloredText,
  rowSegments,
} from '../../../../tools/commander/page/textColors';

const row = (start: number, end: number, text: string) => ({
  start,
  end,
  text,
});

suite('Colors of the rows of a file viewed', () => {
  test('colors a row by the ranges of its line, found by its byte position', () => {
    const colored = coloredText('let a = 1;\nconst b = "x";\n', [
      [{ start: 0, end: 3, kind: 'keyword' }],
      [
        { start: 0, end: 5, kind: 'keyword' },
        { start: 10, end: 13, kind: 'string' },
      ],
    ]);

    assert.deepStrictEqual(
      rowSegments(colored, row(11, 26, 'const b = "x";')),
      [
        { text: 'const', kind: 'keyword' },
        { text: ' b = ' },
        { text: '"x"', kind: 'string' },
        { text: ';' },
      ],
    );
  });

  test('counts the bytes of characters beyond ASCII, and the carriage returns of Windows line ends', () => {
    const colored = coloredText('// é\r\nlet x;\r\n', [
      [{ start: 0, end: 5, kind: 'comment' }],
      [{ start: 0, end: 3, kind: 'keyword' }],
    ]);

    assert.deepStrictEqual(rowSegments(colored, row(0, 7, '// é')), [
      { text: '// é', kind: 'comment' },
    ]);
    assert.deepStrictEqual(rowSegments(colored, row(7, 15, 'let x;')), [
      { text: 'let', kind: 'keyword' },
      { text: ' x;' },
    ]);
  });

  test('colors a row that is a later part of a long line from where it starts in the line', () => {
    const line = `${'é'.repeat(3)}"tail"`;
    const colored = coloredText(line, [[{ start: 3, end: 9, kind: 'string' }]]);

    assert.deepStrictEqual(rowSegments(colored, row(6, 12, '"tail"')), [
      { text: '"tail"', kind: 'string' },
    ]);
  });

  test('leaves a row plain when the text colored no longer has it, as when the file changed since', () => {
    const colored = coloredText('let a;\n', [
      [{ start: 0, end: 3, kind: 'keyword' }],
    ]);

    assert.strictEqual(rowSegments(colored, row(0, 7, 'var a;')), undefined);
    assert.strictEqual(rowSegments(colored, row(40, 47, 'let a;')), undefined);
  });
});
