import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { parsePatch } from '../../../../../components/diff/page/diff';
import { diffRows, lineKeys } from '../../../../../components/diff/page/rows';
import { diffMarks } from '../../../../../components/diff/page/rowMarks';

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

suite('Find in diff', () => {
  test('marks the changes on the scrollbar whatever is shown, the hunks of several files as a file shown entire, and the matches, each kind once where its marks are too close to tell apart', () => {
    const rows = diffRows(parsePatch(patch), new Map(), undefined);
    const keys = lineKeys(rows);
    const matched = new Map([['0:3', []]]);
    const kinds = (least: number) =>
      diffMarks(rows, keys, matched, least).map((mark) => mark.kind);
    assert.deepStrictEqual(kinds(0), [
      'removed',
      'added',
      'removed',
      'added',
      'match',
    ]);
    assert.deepStrictEqual(kinds(1), ['removed', 'added', 'match']);
  });

  test('marks the line of the current match in its own color over the other matches, where the find is, and nothing more without one', () => {
    const rows = diffRows(parsePatch(patch), new Map(), undefined);
    const keys = lineKeys(rows);
    const matched = new Map([['0:3', []]]);
    const marks = (current: string | undefined) =>
      diffMarks(rows, keys, matched, 0, undefined, current)
        .filter((mark) => mark.kind === 'match' || mark.kind === 'current')
        .map((mark) => [mark.kind, mark.top]);
    const [match] = marks(undefined);
    assert.ok(match);
    assert.deepStrictEqual(
      [marks('0:3'), marks(undefined)],
      [[match, ['current', match[1]]], [match]],
    );
  });
});
