import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { plainSearch } from '../../../../lib/shared/searchOptions';
import type { LineWords } from '../../../../lib/page/wordDiff';
import {
  codeProps,
  findRangesByLine,
  wholeChangeClass,
} from '../../../../lib/page/lineMarks';
import { parsePatch } from '../../../../lib/page/diff';
import { findMatches } from '../../../../lib/page/find';

const patch = [
  'diff --git a/a.ts b/a.ts',
  '--- a/a.ts',
  '+++ b/a.ts',
  '@@ -1,2 +1,2 @@',
  ' const Find = 1;',
  '-const find = 2;',
  '+const finder = 2;',
  '@@ -10,1 +10,1 @@',
  ' find(find);',
  'diff --git a/b.ts b/b.ts',
  '--- a/b.ts',
  '+++ b/b.ts',
  '@@ -1,1 +1,1 @@',
  '-nothing',
  '+FIND',
  '',
].join('\n');

suite('Drawing code', () => {
  test('gives a line the same inputs to draw it from while its colors, changed words and matches stay, so it is not drawn again', () => {
    const keyword = [{ start: 0, end: 3, kind: 'keyword' as const }];
    const changed = [{ start: 4, end: 7 }];
    const match = { file: 0, line: 1, start: 4, end: 5 };
    const matched = [match];
    const marks = () => ({
      syntax: new Map([['0:1', keyword]]),
      words: new Map([['0:1', changed]]),
      finds: new Map([['0:1', matched]]),
      foundKey: '0:1',
      found: match,
      whitespace: false,
    });
    const before = codeProps(marks(), '0:1', 'let sum', 'removed');
    const after = codeProps(marks(), '0:1', 'let sum', 'removed');
    assert.deepStrictEqual(
      Object.entries(after).map(([name, value]) => [name, value]),
      Object.entries(before),
    );
    assert.ok(
      Object.values(after).every(
        (value, index) => Object.values(before)[index] === value,
      ),
    );
    assert.strictEqual(before.wordClass, 'word-removed');
    assert.strictEqual(before.current, match);
    const plain = codeProps(marks(), '0:2', 'x', 'added');
    const again = codeProps(marks(), undefined, 'x', undefined);
    assert.deepStrictEqual(plain.syntax, []);
    assert.strictEqual(again.syntax, plain.syntax);
    assert.strictEqual(again.words, plain.words);
    assert.strictEqual(again.finds, plain.finds);
    assert.strictEqual(plain.current, undefined);
    assert.strictEqual(plain.wordClass, 'word-added');
  });

  test('tints the row of a line changed through instead of marking its words', () => {
    const words = new Map<string, LineWords>([
      ['0:1', 'whole'],
      ['0:2', [{ start: 0, end: 1 }]],
    ]);
    const marks = {
      syntax: new Map(),
      words,
      finds: new Map(),
      foundKey: undefined,
      found: undefined,
      whitespace: false,
    };
    assert.deepStrictEqual(codeProps(marks, '0:1', 'x', 'added').words, []);
    assert.deepStrictEqual(codeProps(marks, '0:2', 'x', 'added').words, [
      { start: 0, end: 1 },
    ]);
    assert.strictEqual(wholeChangeClass(words, '0:1'), 'whole-change');
    assert.strictEqual(wholeChangeClass(words, '0:2'), '');
    assert.strictEqual(wholeChangeClass(words, undefined), '');
  });
});

suite('Find in diff', () => {
  test('groups the matches by their line, in order, even a great many on one line', () => {
    const files = parsePatch(patch);
    const byLine = findRangesByLine(
      findMatches(files, undefined, 'find', plainSearch),
    );
    assert.deepStrictEqual(
      [...byLine].map(([key, ranges]) => [
        key,
        ranges.map((range) => [range.start, range.end]),
      ]),
      [
        ['0:0', [[6, 10]]],
        ['0:1', [[6, 10]]],
        ['0:2', [[6, 10]]],
        [
          '0:3',
          [
            [0, 4],
            [5, 9],
          ],
        ],
        ['1:1', [[0, 4]]],
      ],
    );
    const many = Array.from({ length: 50_000 }, (_, start) => ({
      file: 0,
      line: 0,
      start,
      end: start + 1,
    }));
    assert.strictEqual(findRangesByLine(many).get('0:0')?.length, 50_000);
  });
});
