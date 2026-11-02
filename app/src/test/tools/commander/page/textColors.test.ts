import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  coloredText,
  rowSegments,
  withPart,
} from '../../../../tools/commander/page/textColors';
import { packedPart } from '../../../../ui/syntaxParts';
import type { LineRanges } from '../../../../ui/syntaxEngine';

const row = (start: number, end: number, text: string) => ({
  start,
  end,
  text,
});

const colored = (text: string, lines: LineRanges) =>
  withPart(coloredText(text), packedPart(lines, 0, true));

suite('Colors of the rows of a file viewed', () => {
  test('colors a row by the ranges of its line, found by its byte position', () => {
    const text = colored('let a = 1;\nconst b = "x";\n', [
      [{ start: 0, end: 3, kind: 'keyword' }],
      [
        { start: 0, end: 5, kind: 'keyword' },
        { start: 10, end: 13, kind: 'string' },
      ],
    ]);

    assert.deepStrictEqual(rowSegments(text, row(11, 26, 'const b = "x";')), [
      { text: 'const', kind: 'keyword' },
      { text: ' b = ' },
      { text: '"x"', kind: 'string' },
      { text: ';' },
    ]);
  });

  test('counts the bytes of characters beyond ASCII, and the carriage returns of Windows line ends', () => {
    const text = colored('// é\r\nlet x;\r\n', [
      [{ start: 0, end: 5, kind: 'comment' }],
      [{ start: 0, end: 3, kind: 'keyword' }],
    ]);

    assert.deepStrictEqual(rowSegments(text, row(0, 7, '// é')), [
      { text: '// é', kind: 'comment' },
    ]);
    assert.deepStrictEqual(rowSegments(text, row(7, 15, 'let x;')), [
      { text: 'let', kind: 'keyword' },
      { text: ' x;' },
    ]);
  });

  test('colors a row that is a later part of a long line from where it starts in the line', () => {
    const line = `${'é'.repeat(3)}"tail"`;
    const text = colored(line, [[{ start: 3, end: 9, kind: 'string' }]]);

    assert.deepStrictEqual(rowSegments(text, row(6, 12, '"tail"')), [
      { text: '"tail"', kind: 'string' },
    ]);
  });

  test('leaves a row plain when the text colored no longer has it, as when the file changed since', () => {
    const text = colored('let a;\n', [[{ start: 0, end: 3, kind: 'keyword' }]]);

    assert.strictEqual(rowSegments(text, row(0, 7, 'var a;')), undefined);
    assert.strictEqual(rowSegments(text, row(40, 47, 'let a;')), undefined);
  });

  test('leaves the rows of lines not colored yet plain, coloring each once its part comes, and starts over on a part from the first line again', () => {
    const keyword = [{ start: 0, end: 3, kind: 'keyword' as const }];
    const first = withPart(
      coloredText('let a;\nlet b;\n'),
      packedPart([keyword], 0, false),
    );
    const second = row(7, 14, 'let b;');

    assert.strictEqual(rowSegments(first, second), undefined);
    const both = withPart(first, packedPart([keyword], 1, true));
    assert.deepStrictEqual(rowSegments(both, second), [
      { text: 'let', kind: 'keyword' },
      { text: ' b;' },
    ]);
    const again = withPart(both, packedPart([keyword], 0, false));
    assert.strictEqual(rowSegments(again, second), undefined);
    assert.deepStrictEqual(rowSegments(again, row(0, 7, 'let a;')), [
      { text: 'let', kind: 'keyword' },
      { text: ' a;' },
    ]);
  });
});
