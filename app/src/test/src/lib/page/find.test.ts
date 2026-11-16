import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { plainSearch } from '../../../../lib/shared/searchOptions';
import { parsePatch, type DiffFile } from '../../../../lib/page/diff';
import {
  findMatches,
  jumpStep,
  unsearchedFiles,
} from '../../../../lib/page/find';
import { wholeLines } from '../../../../lib/page/diffLines';
import { matchCount } from '../../../../lib/shared/textMatches';

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

const whole = { path: 'c.ts', content: 'find\nnone\n', binary: false };

suite('Find in diff', () => {
  test('searches every line of every file, collapsed or not, numbering lines across hunks', () => {
    const files = parsePatch(patch);
    assert.deepStrictEqual(
      findMatches(files, undefined, 'finder', plainSearch),
      [{ file: 0, line: 2, start: 6, end: 12 }],
    );
    assert.deepStrictEqual(
      findMatches(files, undefined, 'find', plainSearch).map((match) => [
        match.file,
        match.line,
      ]),
      [
        [0, 0],
        [0, 1],
        [0, 2],
        [0, 3],
        [0, 3],
        [1, 1],
      ],
    );
    assert.deepStrictEqual(findMatches(files, undefined, '', plainSearch), []);
  });

  test('searches each file once a query, keeping its matches as other files load or it moves', () => {
    const files = parsePatch(patch);
    const matches = findMatches(files, undefined, 'find', plainSearch);
    const loaded = findMatches(
      [...files, { path: 'big.ts', binary: false, hunks: [] }],
      undefined,
      'find',
      plainSearch,
    );
    matches.forEach((match, index) => assert.strictEqual(loaded[index], match));
    assert.deepStrictEqual(
      findMatches(files.toReversed(), undefined, 'find', plainSearch).map(
        (match) => [match.file, match.line],
      ),
      [
        [0, 1],
        [1, 0],
        [1, 1],
        [1, 2],
        [1, 3],
        [1, 3],
      ],
    );
    assert.deepStrictEqual(
      findMatches(files, undefined, 'finder', plainSearch),
      [{ file: 0, line: 2, start: 6, end: 12 }],
    );
  });

  test('searches the whole of an unchanged file instead, when one is shown', () => {
    assert.deepStrictEqual(findMatches([], whole, 'find', plainSearch), [
      { file: 0, line: 0, start: 0, end: 4 },
    ]);
    assert.deepStrictEqual(wholeLines(whole), ['find', 'none']);
    assert.deepStrictEqual(wholeLines({ ...whole, binary: true }), []);
    assert.deepStrictEqual(wholeLines({ ...whole, content: '' }), []);
  });

  test('leaves out a symbolic link shown whole, whose target is noted rather than shown as a line', () => {
    assert.deepStrictEqual(
      findMatches(
        [],
        { ...whole, content: 'find', link: true },
        'find',
        plainSearch,
      ),
      [],
    );
  });

  test('counts the files left out of a patch as not searched until they load, as their lines are not in the page', () => {
    const files: DiffFile[] = [
      ...parsePatch(patch),
      { path: 'find.ts', binary: false, hunks: [], placeholder: { lines: 9 } },
    ];
    assert.strictEqual(unsearchedFiles(files, undefined), 1);
    assert.strictEqual(unsearchedFiles(files, whole), 0);
    const searched = new Set(
      findMatches(files, undefined, 'find', plainSearch).map(
        ({ file }) => file,
      ),
    );
    assert.deepStrictEqual(
      [...searched].toSorted((a, b) => a - b),
      [0, 1],
    );
  });

  test('stops at 10000 matches, on one line or across files, saying there are more, as each one is marked', () => {
    assert.strictEqual(
      findMatches(
        [],
        { ...whole, content: 'a'.repeat(30_000) },
        'a',
        plainSearch,
      ).length,
      10_000,
    );
    const files = parsePatch(
      ['a.js', 'b.js']
        .flatMap((path) => [
          `diff --git a/${path} b/${path}`,
          `--- a/${path}`,
          `+++ b/${path}`,
          '@@ -1,1 +1,1 @@',
          `-${'a'.repeat(3000)}`,
          `+${'a'.repeat(3000)}`,
        ])
        .join('\n'),
    );
    const matches = findMatches(files, undefined, 'a', plainSearch);
    assert.strictEqual(matches.length, 10_000);
    assert.deepStrictEqual(
      [matches[5999], matches[6000], matches.at(-1)].map((match) => [
        match?.file,
        match?.line,
        match?.start,
      ]),
      [
        [0, 1, 2999],
        [1, 0, 0],
        [1, 1, 999],
      ],
    );
    assert.strictEqual(
      findMatches(files.toReversed(), undefined, 'a', plainSearch)[6000].file,
      1,
    );
    assert.strictEqual(
      matchCount('a', plainSearch, { current: 2, matches: 10_000 }),
      '3 of 10000+',
    );
    assert.strictEqual(
      matchCount('a', plainSearch, { current: 2, matches: 9_999 }),
      '3 of 9999',
    );
  });

  test('jumps to a match once it loads, opening its file first, and gives up when there is none', () => {
    assert.strictEqual(jumpStep(false, true, true), 'wait');
    assert.strictEqual(jumpStep(false, false, true), 'done');
    assert.strictEqual(jumpStep(true, false, false), 'open');
    assert.strictEqual(jumpStep(true, false, true), 'scroll');
    assert.strictEqual(jumpStep(true, true, true), 'scroll');
  });
});
