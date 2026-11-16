import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { parsePatch } from '../../../../lib/page/diff';
import {
  carriedRanges,
  startingRanges,
} from '../../../../lib/page/carriedRanges';
import { range } from '../../tools/git/page/syntaxFixtures';

suite('Syntax', () => {
  test('carries the colors of a diff over to the lines the next diff of the same files still shows, finding each by its file and text in the order they come, so they stay colored until colored anew', () => {
    const before = parsePatch(
      [
        'diff --git a/a.ts b/a.ts',
        '@@ -1,3 +1,3 @@',
        ' }',
        '-x = 1;',
        '+x = 2;',
        ' }',
        '',
      ].join('\n'),
    );
    const after = parsePatch(
      [
        'diff --git a/a.ts b/a.ts',
        '@@ -1,3 +1,4 @@',
        ' }',
        '-x = 1;',
        '+x = 3;',
        '+}',
        ' }',
        'diff --git a/b.ts b/b.ts',
        '@@ -1 +1 @@',
        '-x = 1;',
        '+}',
        '',
      ].join('\n'),
    );
    const ranges = new Map([
      ['0:0', range('keyword')],
      ['0:1', range('number')],
      ['0:2', range('string')],
      ['0:3', range('comment')],
    ]);
    assert.deepStrictEqual(
      carriedRanges({ files: before, whole: undefined, ranges }, after),
      new Map([
        ['0:0', range('keyword')],
        ['0:1', range('number')],
        ['0:3', range('comment')],
        ['0:4', range('comment')],
      ]),
    );
  });

  test('carries the colors of a diff over only to the lines the next diff colors, as a file shown entire or a side shown from its hunks alone colors only its first 5000, and a line past them that matched one colored before stayed colored among plain ones', () => {
    const before = parsePatch(
      [
        'diff --git a/a.ts b/a.ts',
        '@@ -6000 +6000 @@',
        '-x = 1;',
        '+x = 2;',
        '',
      ].join('\n'),
    );
    const ranges = new Map([
      ['0:0', range('keyword')],
      ['0:1', range('number')],
    ]);
    const lines = Array.from({ length: 6000 }, (_, index) =>
      index === 10 || index === 5999 ? 'x = 2;' : 'y;',
    );
    assert.deepStrictEqual(
      carriedRanges({ files: before, whole: undefined, ranges }, [], {
        path: 'a.ts',
        content: lines.join('\n'),
        binary: false,
      }),
      new Map([['0:10', range('number')]]),
    );
    const added = parsePatch(
      [
        'diff --git a/a.ts b/a.ts',
        'new file mode 100644',
        '--- /dev/null',
        '+++ b/a.ts',
        `@@ -0,0 +1,${lines.length} @@`,
        ...lines.map((line) => `+${line}`),
        '',
      ].join('\n'),
    );
    assert.deepStrictEqual(
      carriedRanges({ files: before, whole: undefined, ranges }, added),
      new Map([['0:10', range('number')]]),
    );
  });

  test('starts the colors of a diff from none once another language is chosen, as the colors of the language chosen before would stay where the language chosen next colors nothing, and keeps or carries them otherwise', () => {
    const whole = { path: 'a.conf', content: 'x = 1', binary: false };
    const ranges = new Map([['0:0', range('keyword')]]);
    const python = {
      files: [],
      whole,
      ranges,
      chosen: 'python',
    };
    assert.deepStrictEqual(
      startingRanges(python, python.files, whole, undefined),
      new Map(),
    );
    assert.strictEqual(
      startingRanges(python, python.files, whole, 'python'),
      ranges,
    );
    assert.deepStrictEqual(
      startingRanges(undefined, [], whole, 'python'),
      new Map(),
    );
  });

  test('carries the colors of a file shown entire over to its lines once it is shown anew, or as a diff', () => {
    const whole = { path: 'a.ts', content: 'let a;\nlet b;\n', binary: false };
    const before = {
      files: [],
      whole,
      ranges: new Map([
        ['0:0', range('keyword')],
        ['0:1', range('type')],
      ]),
    };
    assert.deepStrictEqual(
      carriedRanges(before, [], { ...whole, content: 'let b;\nlet a;\n' }),
      new Map([
        ['0:0', range('type')],
        ['0:1', range('keyword')],
      ]),
    );
    const changed = parsePatch(
      [
        'diff --git a/a.ts b/a.ts',
        '@@ -1,2 +1,2 @@',
        ' let a;',
        '-let b;',
        '+let c;',
        '',
      ].join('\n'),
    );
    assert.deepStrictEqual(
      carriedRanges(before, changed),
      new Map([
        ['0:0', range('keyword')],
        ['0:1', range('type')],
      ]),
    );
  });
});
