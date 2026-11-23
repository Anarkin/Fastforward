import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { plainSearch } from '../../../../../lib/shared/searchOptions';
import { findRangesByLine } from '../../../../../components/diff/page/lineMarks';
import { parsePatch } from '../../../../../components/diff/page/diff';
import { findMatches } from '../../../../../components/diff/page/find';

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
