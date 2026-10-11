import * as assert from 'node:assert';
import { parsePatch, type DiffLine } from '../../webview/diff';
import type { FindRange } from '../../webview/find';
import {
  changedTokens,
  pairWordRanges,
  tokenize,
  wordRanges,
} from '../../webview/wordDiff';

function pieces(line: string, ranges: readonly FindRange[]) {
  return ranges.map((range) => line.slice(range.start, range.end));
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

  test('keeps a letter with its marks and joiners, and an emoji, whole, so no token ends inside what is drawn as one character', () => {
    assert.deepStrictEqual(tokenize('मैंने किताब'), ['मैंने', ' ', 'किताब']);
    assert.deepStrictEqual(tokenize('ฉันกินข้าว'), ['ฉันกินข้าว']);
    assert.deepStrictEqual(tokenize('cafe\u0301!'), ['cafe\u0301', '!']);
    assert.deepStrictEqual(tokenize('می\u200cخواهم'), ['می\u200cخواهم']);
    const england = '🏴\u{e0067}\u{e0062}\u{e0065}\u{e006e}\u{e0067}\u{e007f}';
    assert.deepStrictEqual(
      tokenize(`👍🏽👨\u200d👩\u200d👧🇭🇺${england}#\ufe0f\u20e3?\u0301`),
      ['👍🏽', '👨\u200d👩\u200d👧', '🇭🇺', england, '#\ufe0f\u20e3', '?\u0301'],
    );
  });

  test('marks the word a change replaced, rather than the pieces of it written differently', () => {
    const before = 'मैंने किताब पढ़ी';
    const after = 'मैंने कविता पढ़ी';
    const ranges = pairWordRanges(before, after);
    assert.ok(ranges);
    assert.deepStrictEqual(pieces(before, ranges.removed), ['किताब']);
    assert.deepStrictEqual(pieces(after, ranges.added), ['कविता']);
    assert.deepStrictEqual(pairWordRanges('cafe\u0301 ok', 'cafe ok'), {
      removed: [{ start: 0, end: 5 }],
      added: [{ start: 0, end: 4 }],
    });
    assert.deepStrictEqual(pairWordRanges('ok 👍🏻', 'ok 👍🏽'), {
      removed: [{ start: 3, end: 7 }],
      added: [{ start: 3, end: 7 }],
    });
  });

  test('marks the tokens two sequences do not share', () => {
    assert.deepStrictEqual(changedTokens(['a', 'b', 'c'], ['a', 'x', 'c']), {
      a: [false, true, false],
      b: [false, true, false],
    });
  });

  test('marks only the words a change replaced, joining neighbours across spaces', () => {
    const before = 'const total = a + b;';
    const after = 'const sum = a + b + c;';
    const ranges = pairWordRanges(before, after);
    assert.ok(ranges);
    assert.deepStrictEqual(pieces(before, ranges.removed), ['total', '']);
    assert.deepStrictEqual(pieces(after, ranges.added), ['sum', '+ c']);
  });

  test('marks where the other line has words inserted with no width, between the characters they came between', () => {
    const inserted = pairWordRanges(
      '!(picked && active)',
      '!((picked || named) && active)',
    );
    assert.deepStrictEqual(inserted, {
      removed: [
        { start: 2, end: 2 },
        { start: 9, end: 9 },
      ],
      added: [
        { start: 2, end: 3 },
        { start: 10, end: 19 },
      ],
    });
    assert.deepStrictEqual(pairWordRanges('f(a, b)', 'f(a)'), {
      removed: [{ start: 3, end: 6 }],
      added: [{ start: 3, end: 3 }],
    });
    assert.deepStrictEqual(pairWordRanges('b;', 'a b;'), {
      removed: [{ start: 0, end: 0 }],
      added: [{ start: 0, end: 1 }],
    });
    assert.deepStrictEqual(pairWordRanges('other();', 'another();'), {
      removed: [{ start: 0, end: 5 }],
      added: [{ start: 0, end: 7 }],
    });
  });

  test('marks no place where the other line has only spaces inserted', () => {
    assert.deepStrictEqual(pairWordRanges('a+b', 'a + b'), {
      removed: [],
      added: [],
    });
  });

  test('marks nothing when the lines share no word, or are too long to compare', () => {
    assert.strictEqual(pairWordRanges('foo', 'bar'), undefined);
    assert.strictEqual(pairWordRanges('  ', 'bar'), undefined);
    const long = 'x '.repeat(1000);
    assert.strictEqual(pairWordRanges(long, long + 'y'), undefined);
  });

  test('gives up on lines too long to compare before splitting them into tokens, however long they are', () => {
    const long = 'x '.repeat(1_000_000);
    const started = performance.now();
    assert.strictEqual(pairWordRanges(long, long), undefined);
    assert.ok(performance.now() - started < 100);
  });

  test('gives up at once on an empty line, which shares no word, however long the line it is paired with', () => {
    const long = 'x '.repeat(1_000_000);
    const started = performance.now();
    assert.strictEqual(pairWordRanges('', long), undefined);
    assert.strictEqual(pairWordRanges(long, ''), undefined);
    assert.ok(performance.now() - started < 100);
  });

  test("compares lines of up to 1 million removed tokens times added tokens, spaces and punctuation counting as tokens, as the word diff's table grows with both counts", () => {
    const short = 'let a = b;';
    const line = short.repeat(125);
    assert.ok(pairWordRanges(line, line));
    assert.strictEqual(pairWordRanges(line, line + 'c'), undefined);
    const long = short.repeat(15_625);
    assert.ok(pairWordRanges(short, long));
    assert.ok(pairWordRanges(long, short));
    assert.strictEqual(pairWordRanges(short, long + 'c'), undefined);
    assert.strictEqual(pairWordRanges(long + 'c', short), undefined);
  });

  test('compares each removed line with the added line it is paired with, keyed as the search keys lines, and marks those with no partner or no word in common as changed through', () => {
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
        'whole',
        'whole',
        'whole',
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

  test('compares the words of only the pair a drawn line is in, as a block can be a whole file changed through', () => {
    const count = 201;
    const [file] = parsePatch(
      [
        'diff --git a/a.ts b/a.ts',
        '--- a/a.ts',
        '+++ b/a.ts',
        `@@ -1,${count} +1,${count} @@`,
        ...Array.from({ length: count }, (_, i) => `-let total${i} = 1;`),
        ...Array.from({ length: count }, (_, i) => `+let sum${i} = 1;`),
        '',
      ].join('\n'),
    );
    const read = new Set<number>();
    const ranges = wordRanges([
      {
        ...file,
        hunks: [
          {
            lines: file.hunks[0].lines.map((line, index) => ({
              kind: line.kind,
              oldNumber: line.oldNumber,
              newNumber: line.newNumber,
              get text() {
                read.add(index);
                return line.text;
              },
            })),
          },
        ],
      },
    ]);
    assert.deepStrictEqual(ranges.get('0:5'), [{ start: 4, end: 10 }]);
    read.clear();
    assert.deepStrictEqual(ranges.get(`0:${count + 7}`), [
      { start: 4, end: 8 },
    ]);
    assert.deepStrictEqual([...read], [7, count + 7]);
    read.clear();
    assert.deepStrictEqual(ranges.get('0:7'), [{ start: 4, end: 10 }]);
    assert.deepStrictEqual([...read], []);
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

  test('marks a line with no partner as changed through, though its words are on the line paired with another', () => {
    const files = parsePatch(
      [
        'diff --git a/a.ts b/a.ts',
        '--- a/a.ts',
        '+++ b/a.ts',
        '@@ -1,2 +1,1 @@',
        '-for i in evenNumbers do',
        '-for i in 3 .. top do',
        '+for i in 1 .. top do',
        '',
      ].join('\n'),
    );
    const ranges = wordRanges(files);
    assert.strictEqual(ranges.get('0:0'), 'whole');
    assert.deepStrictEqual(ranges.get('0:1'), [{ start: 9, end: 10 }]);
    assert.deepStrictEqual(ranges.get('0:2'), [{ start: 9, end: 10 }]);
  });
});
