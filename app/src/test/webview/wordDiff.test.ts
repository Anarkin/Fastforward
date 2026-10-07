import * as assert from 'node:assert';
import { parsePatch, type DiffLine } from '../../webview/diff';
import type { FindRange } from '../../webview/find';
import {
  blockWordRanges,
  changedTokens,
  tokenize,
  wholeText,
  wordRanges,
} from '../../webview/wordDiff';

function pieces(lines: readonly string[], ranges: readonly FindRange[][]) {
  return lines.map((line, index) =>
    ranges[index].map((range) => line.slice(range.start, range.end)),
  );
}

suite('Word diff', () => {
  test('splits a line into words, runs of spaces and single marks', () => {
    assert.deepStrictEqual(tokenize('a_b1 = f(x, "é");'), [
      'a_b1',
      ' ',
      '=',
      ' ',
      'f',
      '(',
      'x',
      ',',
      ' ',
      '"',
      'é',
      '"',
      ')',
      ';',
    ]);
  });

  test('marks the tokens two sequences do not share', () => {
    assert.deepStrictEqual(changedTokens(['a', 'b', 'c'], ['a', 'x', 'c']), {
      a: [false, true, false],
      b: [false, true, false],
    });
  });

  test('marks only the words a change replaced, joining neighbours across spaces', () => {
    const before = ['const total = a + b;'];
    const after = ['const sum = a + b + c;'];
    const ranges = blockWordRanges(before, after);
    assert.ok(ranges);
    assert.deepStrictEqual(pieces(before, ranges.removed), [['total']]);
    assert.deepStrictEqual(pieces(after, ranges.added), [['sum', '+ c']]);
  });

  test('keeps what moved to other lines, marking only what is new', () => {
    const before = ['  <div className="menu" role="menu">'];
    const after = [
      '  <div',
      '    className="menu"',
      '    role="menu"',
      '    ref={menu}',
      '  >',
    ];
    const ranges = blockWordRanges(before, after);
    assert.ok(ranges);
    assert.deepStrictEqual(pieces(before, ranges.removed), [[]]);
    assert.deepStrictEqual(pieces(after, ranges.added), [
      [],
      [],
      [],
      ['ref={menu}'],
      [],
    ]);
  });

  test('marks nothing when the lines share no word, or one side is empty, or the block is too big to compare', () => {
    assert.strictEqual(blockWordRanges(['foo'], ['bar']), undefined);
    assert.strictEqual(blockWordRanges([], ['bar']), undefined);
    const long = 'x '.repeat(1000);
    assert.strictEqual(blockWordRanges([long], [long + 'y']), undefined);
  });

  test('gives up on a block too big to compare before splitting its lines into tokens, however long they are', () => {
    const long = 'x '.repeat(1_000_000);
    const started = performance.now();
    assert.strictEqual(blockWordRanges([long], [long]), undefined);
    assert.ok(performance.now() - started < 100);
  });

  test('compares a block of up to 1 million removed by added tokens, spaces and punctuation counting as tokens', () => {
    const lines = Array<string>(125).fill('let a = b;');
    assert.ok(blockWordRanges(lines, lines));
    assert.strictEqual(blockWordRanges(lines, [...lines, 'c']), undefined);
  });

  test('compares each run of removed lines with the added lines after it, keyed as the search keys lines', () => {
    const files = parsePatch(
      [
        'diff --git a/a.ts b/a.ts',
        '--- a/a.ts',
        '+++ b/a.ts',
        '@@ -1,6 +1,6 @@',
        ' keep',
        '-let total = 1;',
        '+let sum = 1;',
        ' keep',
        '-  only gone  ',
        '+',
        '+foo',
        '',
      ].join('\n'),
    );
    const ranges = wordRanges(files);
    assert.deepStrictEqual(
      Array.from({ length: 8 }, (_, line) => ranges.get(`0:${line}`)),
      [
        undefined,
        [{ start: 4, end: 9 }],
        [{ start: 4, end: 7 }],
        undefined,
        [{ start: 2, end: 11 }],
        undefined,
        [{ start: 0, end: 3 }],
        undefined,
      ],
    );
    assert.strictEqual(ranges.get('1:1'), undefined);
  });

  test('compares the words of a block only once a line of it is drawn, as most of a long patch never is', () => {
    const [file] = parsePatch(
      [
        'diff --git a/a.ts b/a.ts',
        '--- a/a.ts',
        '+++ b/a.ts',
        '@@ -1,3 +1,3 @@',
        '-let total = 1;',
        '+let sum = 1;',
        ' keep',
        '-other();',
        '+another();',
        '',
      ].join('\n'),
    );
    let read = 0;
    const watched = (line: DiffLine): DiffLine => ({
      kind: line.kind,
      oldNumber: line.oldNumber,
      newNumber: line.newNumber,
      get text() {
        read++;
        return line.text;
      },
    });
    const lines = file.hunks[0].lines;
    const ranges = wordRanges([
      {
        ...file,
        hunks: [
          { lines: [...lines.slice(0, 3), ...lines.slice(3).map(watched)] },
        ],
      },
    ]);
    assert.deepStrictEqual(ranges.get('0:0'), [{ start: 4, end: 9 }]);
    assert.strictEqual(read, 0);
    assert.deepStrictEqual(ranges.get('0:4'), [{ start: 0, end: 7 }]);
    assert.ok(read > 0);
  });

  test('pairs the words of each file once, keeping them as the file moves among the others', () => {
    const [file] = parsePatch(
      [
        'diff --git a/a.ts b/a.ts',
        '--- a/a.ts',
        '+++ b/a.ts',
        '@@ -1,1 +1,1 @@',
        '-let total = 1;',
        '+let sum = 1;',
        '',
      ].join('\n'),
    );
    const other = { path: 'b.ts', binary: false, hunks: [] };
    const alone = wordRanges([file]);
    const moved = wordRanges([other, file]);
    assert.strictEqual(moved.get('0:0'), undefined);
    assert.ok(moved.get('1:0'));
    assert.strictEqual(moved.get('1:0'), alone.get('0:0'));
    assert.strictEqual(moved.get('1:1'), alone.get('0:1'));
  });

  test('marks the whole text of a line changed through, from its first character to its last, and nothing of a blank one', () => {
    assert.deepStrictEqual(wholeText('  gone  '), [{ start: 2, end: 6 }]);
    assert.deepStrictEqual(wholeText('x'), [{ start: 0, end: 1 }]);
    assert.strictEqual(wholeText('   '), undefined);
    assert.strictEqual(wholeText(''), undefined);
  });
});
