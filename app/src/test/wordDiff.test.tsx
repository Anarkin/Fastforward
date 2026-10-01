import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { parsePatch } from '../webview/diff';
import { marked } from '../webview/diffView';
import type { FindRange } from '../webview/find';
import {
  blockWordRanges,
  changedTokens,
  tokenize,
  wholeText,
  wordRanges,
} from '../webview/wordDiff';

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
    assert.deepStrictEqual([...ranges.keys()], ['0:1', '0:2', '0:4', '0:6']);
    assert.deepStrictEqual(ranges.get('0:1'), [{ start: 4, end: 9 }]);
    assert.deepStrictEqual(ranges.get('0:2'), [{ start: 4, end: 7 }]);
    assert.deepStrictEqual(ranges.get('0:4'), [{ start: 2, end: 11 }]);
    assert.deepStrictEqual(ranges.get('0:6'), [{ start: 0, end: 3 }]);
  });

  test('marks the whole text of a line changed through, from its first character to its last, and nothing of a blank one', () => {
    assert.deepStrictEqual(wholeText('  gone  '), [{ start: 2, end: 6 }]);
    assert.deepStrictEqual(wholeText('x'), [{ start: 0, end: 1 }]);
    assert.strictEqual(wholeText('   '), undefined);
    assert.strictEqual(wholeText(''), undefined);
  });

  test('draws the changed words inside the line, with search matches over them', () => {
    const html = renderToStaticMarkup(
      <>
        {marked(
          'let sum = 1',
          [],
          [{ start: 4, end: 7 }],
          'word-added',
          [{ start: 5, end: 9 }],
          { start: 5, end: 9 },
        )}
      </>,
    );
    assert.strictEqual(
      html,
      'let <span class="word-added">s</span><span class="word-added"><mark class="find-match current">um</mark></span><mark class="find-match current"> =</mark> 1',
    );
    assert.strictEqual(
      marked('plain', [], [], 'word-added', [], undefined),
      'plain',
    );
  });
});
