import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  coloredText,
  rowSegments,
  wholeText,
  withPart,
} from '../../../../tools/commander/page/textColors';
import type { TextEncoding } from '../../../../tools/commander/shared/protocol';
import { packedPart } from '../../../../ui/syntaxParts';
import type { LineRanges } from '../../../../ui/syntaxEngine';

const row = (start: number, end: number, text: string) => ({
  start,
  end,
  text,
});

const colored = (
  text: string,
  lines: LineRanges,
  encoding: TextEncoding = 'utf-8',
  marked = false,
) => withPart(coloredText(text, encoding, marked), packedPart(lines, 0, true));

const keyword = [{ start: 0, end: 3, kind: 'keyword' as const }];

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

  test('counts a byte a character in a code page of one byte a character', () => {
    const text = colored(
      '// é\r\nlet x;\r\n',
      [[{ start: 0, end: 4, kind: 'comment' }], keyword],
      'windows-1252',
    );

    assert.deepStrictEqual(rowSegments(text, row(6, 14, 'let x;')), [
      { text: 'let', kind: 'keyword' },
      { text: ' x;' },
    ]);
  });

  test('counts two bytes a unit of UTF-16, for characters beyond ASCII and line ends too', () => {
    const text = colored(
      '// é\r\nlet x;\r\n',
      [[{ start: 0, end: 4, kind: 'comment' }], keyword],
      'utf-16le',
    );

    assert.deepStrictEqual(rowSegments(text, row(0, 12, '// é')), [
      { text: '// é', kind: 'comment' },
    ]);
    assert.deepStrictEqual(rowSegments(text, row(12, 28, 'let x;')), [
      { text: 'let', kind: 'keyword' },
      { text: ' x;' },
    ]);
  });

  test('counts the byte order mark of UTF-8 before the first line, leaving it plain on the first row, which has it', () => {
    const text = colored('let a;\nlet b;\n', [keyword, keyword], 'utf-8', true);

    assert.deepStrictEqual(rowSegments(text, row(0, 10, '﻿let a;')), [
      { text: '﻿' },
      { text: 'let', kind: 'keyword' },
      { text: ' a;' },
    ]);
    assert.deepStrictEqual(rowSegments(text, row(10, 17, 'let b;')), [
      { text: 'let', kind: 'keyword' },
      { text: ' b;' },
    ]);
  });

  test('counts the byte order mark of UTF-16 before the first line, which the first row leaves out though it starts at the start of the file', () => {
    const text = colored(
      'let a;\nlet b;\n',
      [keyword, keyword],
      'utf-16be',
      true,
    );

    assert.deepStrictEqual(rowSegments(text, row(0, 16, 'let a;')), [
      { text: 'let', kind: 'keyword' },
      { text: ' a;' },
    ]);
    assert.deepStrictEqual(rowSegments(text, row(16, 30, 'let b;')), [
      { text: 'let', kind: 'keyword' },
      { text: ' b;' },
    ]);
  });

  test('takes the byte order mark off the whole text, noting it was there, as the rows count its bytes', () => {
    assert.deepStrictEqual(wholeText('﻿let a;'), {
      text: 'let a;',
      marked: true,
    });
    assert.deepStrictEqual(wholeText('let a;'), {
      text: 'let a;',
      marked: false,
    });
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
    const first = withPart(
      coloredText('let a;\nlet b;\n', 'utf-8', false),
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

  test('leaves the rows of a line too long to color plain at once, rather than counting the bytes of the line up to each, as a line of megabytes made every row shown take long', () => {
    const line = '"x":1,'.repeat(400_000);
    const text = colored(`let a;\n${line}\n`, [
      [{ start: 0, end: 3, kind: 'keyword' }],
      [],
    ]);
    const started = performance.now();

    for (let index = 0; index < 100; index++) {
      const start = 7 + 2_000_000 + index * 4096;
      assert.strictEqual(
        rowSegments(text, {
          start,
          end: start + 4096,
          text: line.slice(start - 7, start - 7 + 4096),
        }),
        undefined,
      );
    }

    assert.ok(performance.now() - started < 100);
  });

  test('colors the rows of a long line of many tokens from the ranges of each row, rather than the ranges and characters of the whole line for every row', () => {
    const line = 'a+b;'.repeat(5000);
    const ranges = Array.from({ length: 10_000 }, (_, index) => ({
      start: index * 2,
      end: index * 2 + 1,
      kind: 'keyword' as const,
    }));
    const text = colored(`${line}\n`, [ranges]);
    const rows = Array.from({ length: 200 }, (_, index) =>
      row(
        index * 100,
        index * 100 + 100,
        line.slice(index * 100, index * 100 + 100),
      ),
    );
    const started = performance.now();

    for (let pass = 0; pass < 10; pass++) {
      for (const each of rows) {
        assert.strictEqual(rowSegments(text, each)?.length, 100);
      }
    }

    assert.ok(performance.now() - started < 100);
    assert.deepStrictEqual(rowSegments(text, rows[199])?.slice(0, 2), [
      { text: 'a', kind: 'keyword' },
      { text: '+' },
    ]);
  });
});
