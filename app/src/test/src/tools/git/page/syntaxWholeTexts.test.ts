import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { parsePatch } from '../../../../../tools/git/page/diff';
import {
  carriedRanges,
  startingRanges,
  syntaxSources,
  textsToLoad,
} from '../../../../../tools/git/page/syntax';
import {
  blobs,
  loadedTexts,
  range,
  warmsUpTheGrammar,
  gappedPatch,
} from './syntaxFixtures';

suite('Syntax', () => {
  warmsUpTheGrammar();

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

  test('asks for the whole text of each side with lines hidden before a hunk, once a diff', () => {
    const requested = new Set<string>();
    const files = parsePatch(gappedPatch);
    assert.deepStrictEqual(textsToLoad(files, 1, requested), [
      { path: 'a.ts', side: 'old', blob: '1'.repeat(40) },
      { path: 'a.ts', side: 'new', blob: '2'.repeat(40) },
    ]);
    assert.deepStrictEqual(textsToLoad(files, 1, requested), []);
    assert.strictEqual(textsToLoad(files, 2, requested).length, 2);
  });

  test('forgets the whole texts asked for by the diffs before, as a diff refreshed for hours kept every one', () => {
    const requested = new Set<string>();
    const files = parsePatch(gappedPatch);
    for (const diff of [1, 2, 3]) {
      textsToLoad(files, diff, requested);
    }
    assert.deepStrictEqual([...requested], ['3:old:a.ts', '3:new:a.ts']);
  });

  test('asks a diff drawn anew only for the whole texts of the sides whose blob changed', () => {
    const texts = loadedTexts([['old:a.ts', 'old text']]).set('new:a.ts', {
      blob: '3'.repeat(40),
      text: 'new text',
    });
    assert.deepStrictEqual(
      textsToLoad(parsePatch(gappedPatch), 2, new Set(), undefined, texts),
      [{ path: 'a.ts', side: 'new', blob: blobs.new }],
    );
  });

  test('asks for no text of a side shown from its first line on, of a side a file lacks, or of a file it cannot color', () => {
    const files = parsePatch(
      [
        'diff --git a/a.ts b/a.ts',
        'new file mode 100644',
        'index 0000000000000000000000000000000000000000..2222222222222222222222222222222222222222',
        '--- /dev/null',
        '+++ b/a.ts',
        '@@ -0,0 +1,2 @@',
        '+let a;',
        '+let b;',
        'diff --git a/b.ts b/b.ts',
        'index 1111111111111111111111111111111111111111..2222222222222222222222222222222222222222 100644',
        '--- a/b.ts',
        '+++ b/b.ts',
        '@@ -1,2 +1,3 @@',
        ' let a;',
        '+let b;',
        ' let c;',
        '@@ -5 +6 @@',
        '-let d;',
        '+let e;',
        'diff --git a/notes.unknown b/notes.unknown',
        'index 1111111111111111111111111111111111111111..2222222222222222222222222222222222222222 100644',
        '@@ -5 +5 @@',
        '-a',
        '+b',
        '',
      ].join('\n'),
    );
    assert.deepStrictEqual(textsToLoad(files, 1, new Set()), [
      { path: 'b.ts', side: 'old', blob: '1'.repeat(40) },
      { path: 'b.ts', side: 'new', blob: '2'.repeat(40) },
    ]);
    assert.deepStrictEqual(textsToLoad(files.slice(0, 1), 1, new Set()), []);
  });

  const addedPatch = [
    'diff --git a/a.ts b/a.ts',
    'index 1111111111111111111111111111111111111111..2222222222222222222222222222222222222222 100644',
    '--- a/a.ts',
    '+++ b/a.ts',
    '@@ -3,1 +3,2 @@',
    ' end */',
    '+new = 2;',
    '',
  ].join('\n');

  test('asks for the colors of every line of a side shown whole from its first line, as of an added file, so the page keeps them by its blob without its text, but not of one shown from hunks apart', () => {
    const added = parsePatch(
      [
        'diff --git a/b.ts b/b.ts',
        'new file mode 100644',
        `index ${'0'.repeat(40)}..${'3'.repeat(40)}`,
        '--- /dev/null',
        '+++ b/b.ts',
        '@@ -0,0 +1,2 @@',
        '+let a = 1;',
        '+let b = 2;',
        '',
      ].join('\n'),
    );
    assert.deepStrictEqual(
      syntaxSources(added, undefined).map(({ entire }) => entire),
      [true],
    );
    assert.deepStrictEqual(
      syntaxSources(parsePatch(gappedPatch), undefined).map(
        ({ entire }) => entire,
      ),
      [undefined, undefined],
    );
  });

  test('takes an old side shown from its first line from its hunks as the whole text of its blob only when it shows no unchanged line, as git ignoring whitespace prints those as the new side has them', () => {
    const reindented = parsePatch(
      [
        'diff --git a/a.ts b/a.ts',
        `index ${'1'.repeat(40)}..${'2'.repeat(40)} 100644`,
        '--- a/a.ts',
        '+++ b/a.ts',
        '@@ -1,3 +1,3 @@',
        ' int x;',
        ' foo();',
        '-bar();',
        '+qux();',
        '',
      ].join('\n'),
    );
    assert.deepStrictEqual(
      syntaxSources(reindented, undefined).map(({ entire }) => entire),
      [undefined, true],
    );
    const deleted = parsePatch(
      [
        'diff --git a/b.ts b/b.ts',
        'deleted file mode 100644',
        `index ${'3'.repeat(40)}..${'0'.repeat(40)}`,
        '--- a/b.ts',
        '+++ /dev/null',
        '@@ -1,2 +0,0 @@',
        '-let a = 1;',
        '-let b = 2;',
        '',
      ].join('\n'),
    );
    assert.deepStrictEqual(
      syntaxSources(deleted, undefined).map(({ entire }) => entire),
      [true],
    );
  });

  test('asks for no text of a side that owns none of the lines shown, or with lines shown too far into it', () => {
    assert.deepStrictEqual(textsToLoad(parsePatch(addedPatch), 1, new Set()), [
      { path: 'a.ts', side: 'new', blob: '2'.repeat(40) },
    ]);
    const farPatch = [
      'diff --git a/a.ts b/a.ts',
      'index 1111111111111111111111111111111111111111..2222222222222222222222222222222222222222 100644',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -3,1 +3,1 @@',
      '-old = 1;',
      '+new = 2;',
      '@@ -5001,1 +5001,1 @@',
      '-old = 1;',
      '+new = 2;',
      '',
    ].join('\n');
    assert.deepStrictEqual(textsToLoad(parsePatch(farPatch), 1, new Set()), []);
  });

  test('colors no side that owns none of the lines shown', () => {
    assert.deepStrictEqual(
      syntaxSources(parsePatch(addedPatch), undefined).map(
        (source) => source.lines,
      ),
      [['end */', 'new = 2;']],
    );
  });

  test('leaves files of unknown languages, binary files and files not loaded yet out', () => {
    const files = parsePatch(
      [
        'diff --git a/notes.unknown b/notes.unknown',
        '@@ -0,0 +1 @@',
        '+text',
        'diff --git a/image.png b/image.png',
        'Binary files a/image.png and b/image.png differ',
        '',
      ].join('\n'),
    );
    assert.deepStrictEqual(
      syntaxSources(
        [
          ...files,
          {
            path: 'large.ts',
            binary: false,
            hunks: [],
            placeholder: { lines: 9 },
          },
        ],
        undefined,
      ),
      [],
    );
  });

  test('colors a file in the language chosen for it, whatever its name tells, asking for the whole text of its sides as for any file it colors', () => {
    const files = parsePatch(
      [
        'diff --git a/notes.unknown b/notes.unknown',
        'index 1111111111111111111111111111111111111111..2222222222222222222222222222222222222222 100644',
        '@@ -5 +5 @@',
        '-{"a": 1}',
        '+{"a": 2}',
        '',
      ].join(String.fromCharCode(10)),
    );

    assert.deepStrictEqual(
      syntaxSources(files, undefined, new Map(), undefined, 'json').map(
        (source) => [source.language, source.lines],
      ),
      [
        ['json', ['{"a": 1}']],
        ['json', ['{"a": 2}']],
      ],
    );
    assert.deepStrictEqual(
      syntaxSources(
        [],
        { path: 'a.ts', binary: false, content: 'x' },
        new Map(),
        undefined,
        'json',
      ).map((source) => source.language),
      ['json'],
    );
    assert.deepStrictEqual(
      textsToLoad(files, 1, new Set(), undefined, new Map(), 'json'),
      [
        { path: 'notes.unknown', side: 'old', blob: '1'.repeat(40) },
        { path: 'notes.unknown', side: 'new', blob: '2'.repeat(40) },
      ],
    );
  });
});
