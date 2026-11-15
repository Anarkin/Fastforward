import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { parsePatch } from '../../../../../tools/git/page/diff';
import { diffRows, lineKeys } from '../../../../../tools/git/page/diffRows';
import { diffMinimapMarks } from '../../../../../tools/git/page/diffMinimap';

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
  test('marks the changes on the minimap only when asked, as for a file shown entire, but the matches always', () => {
    const rows = diffRows(parsePatch(patch), new Map(), undefined);
    const keys = lineKeys(rows);
    const matched = new Map([['0:3', []]]);
    const kinds = (changeMarks: boolean) =>
      diffMinimapMarks(rows, keys, matched, changeMarks).map(
        (mark) => mark.kind,
      );
    assert.deepStrictEqual(kinds(false), ['match']);
    assert.deepStrictEqual(kinds(true), [
      'removed',
      'added',
      'removed',
      'added',
      'match',
    ]);
  });
});
