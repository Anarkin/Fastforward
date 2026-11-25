import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { wellFormed } from '../../../../../tools/git/main/messageChecks';

const viewing = (more: object) =>
  wellFormed({
    type: 'viewFile',
    root: '/repo',
    path: 'a.ts',
    ...more,
  });

const searching = (more: object) =>
  wellFormed({
    type: 'searchCommits',
    root: '/repo',
    query: 'fix',
    options: { caseSensitive: false, wholeWord: false, regex: false },
    ...more,
  });

suite('Git message checks', () => {
  test('views a file from the working tree, a blob or a version it takes, and nothing else', () => {
    assert.deepStrictEqual(
      [
        {},
        { blob: 'b'.repeat(40) },
        { rev: 'HEAD' },
        { rev: 'index' },
        { rev: `${'c'.repeat(40)}^` },
      ].map(viewing),
      [true, true, true, true, true],
    );
    assert.deepStrictEqual(
      [{ rev: 'main' }, { rev: '--output=x' }, { rev: 5 }].map(viewing),
      [false, false, false],
    );
  });

  test('searches the commits for as many as a filter of the list takes, a whole number up to ten thousand, or as many as the search lists when it gives none', () => {
    assert.deepStrictEqual(
      [{}, { limit: 1 }, { limit: 1000 }, { limit: 10_000 }].map(searching),
      [true, true, true, true],
    );
    assert.deepStrictEqual(
      [
        { limit: 0 },
        { limit: 10_001 },
        { limit: 2.5 },
        { limit: '1000' },
        { limit: null },
      ].map(searching),
      [false, false, false, false, false],
    );
  });
});
