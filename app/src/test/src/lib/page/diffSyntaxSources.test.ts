import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { parsePatch } from '../../../../lib/page/diff';
import type { LoadedText } from '../../../../lib/page/sideTexts';
import { syntaxSources } from '../../../../lib/page/diffSyntaxSources';
import { textsToLoad } from '../../../../lib/page/textsToLoad';
import {
  colored,
  blobs,
  loadedTexts,
  linesColored,
  gappedPatch,
  addedPatch,
  paths,
  farFiles,
} from '../../tools/git/page/syntaxFixtures';
import { warmsUpTheGrammar } from './syntaxFixtures';

suite('Syntax', () => {
  warmsUpTheGrammar();

  test('colors each side of a diff on its own, a removed line in what came before it', async () => {
    const patch = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1,4 +1,4 @@',
      ' /* start',
      '-*/ let a = 1;',
      '+still a comment',
      ' end */',
      ' let b = 2;',
      '',
    ].join('\n');
    assert.deepStrictEqual(await colored(parsePatch(patch), undefined), {
      '0:0': ['comment /* start'],
      '0:1': [
        'comment */',
        'keyword let',
        'keyword =',
        'number 1',
        'keyword ;',
      ],
      '0:2': ['comment still a comment'],
      '0:3': ['comment end */'],
      '0:4': ['keyword let', 'keyword =', 'number 2', 'keyword ;'],
    });
  });

  test('colors a hunk starting inside a comment as the whole text of each side has it', async () => {
    const texts = loadedTexts([
      ['old:a.ts', '/* start\r\nmiddle\r\nold = 1;\r\nend */\r\nlet a;\r\n'],
      ['new:a.ts', '/* start\nmiddle\nnew = 2;\nend */\n'],
    ]);
    assert.deepStrictEqual(
      await colored(parsePatch(gappedPatch), undefined, texts),
      {
        '0:0': ['comment old = 1;'],
        '0:1': ['comment new = 2;'],
        '0:2': ['comment end */'],
      },
    );
  });

  test('gives the new side of a file its old side as a twin, pairing each line with the line of the old side it is unchanged from, in the hunks and between them, so the engine colors it from the old side', () => {
    const files = parsePatch(
      [
        'diff --git a/a.ts b/a.ts',
        'index 1111111111111111111111111111111111111111..2222222222222222222222222222222222222222 100644',
        '--- a/a.ts',
        '+++ b/a.ts',
        '@@ -2,3 +2,4 @@',
        ' b;',
        '-c;',
        '+c2;',
        '+c3;',
        ' d;',
        '@@ -8,2 +9,1 @@',
        '-h;',
        ' i;',
        '',
      ].join('\n'),
    );
    const twins = (texts: ReadonlyMap<string, LoadedText>) =>
      syntaxSources(files, undefined, texts).map(({ twin }) => twin);
    assert.deepStrictEqual(twins(new Map()), [
      undefined,
      { source: 0, lines: [0, undefined, undefined, 2, 4] },
    ]);
    assert.deepStrictEqual(
      twins(
        loadedTexts([
          ['old:a.ts', 'a;\nb;\nc;\nd;\ne;\nf;\ng;\nh;\ni;\n'],
          ['new:a.ts', 'a;\nb;\nc2;\nc3;\nd;\ne;\nf;\ng;\ni;\n'],
        ]),
      ),
      [
        undefined,
        { source: 0, lines: [0, 1, undefined, undefined, 3, 4, 5, 6, 8] },
      ],
    );
  });

  test('colors a hunk of a file with CRLF line ends as its whole text has it', async () => {
    const crlfPatch = [
      'diff --git a/a.ts b/a.ts',
      'index 1111111111111111111111111111111111111111..2222222222222222222222222222222222222222 100644',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -3,2 +3,2 @@',
      '-old = 1;\r',
      '+new = 2;\r',
      ' end */\r',
      '',
    ].join('\n');
    const texts = loadedTexts([
      ['old:a.ts', '/* start\r\nmiddle\r\nold = 1;\r\nend */\r\n'],
      ['new:a.ts', '/* start\r\nmiddle\r\nnew = 2;\r\nend */\r\n'],
    ]);
    assert.deepStrictEqual(
      await colored(parsePatch(crlfPatch), undefined, texts),
      {
        '0:0': ['comment old = 1;'],
        '0:1': ['comment new = 2;'],
        '0:2': ['comment end */'],
      },
    );
  });

  test('colors a side from its hunks alone when they show a line past its 5000th, as tokenizing is sequential, so a late line costs every line before it', () => {
    assert.deepStrictEqual(
      linesColored(5000).map((lines) => lines.length),
      [1, 5000],
    );
    assert.deepStrictEqual(linesColored(5001), [['old = 1;'], ['new = 2;']]);
  });

  test('colors only the first 5000 lines of a file shown entire, or of a side shown from its hunks alone', () => {
    const lines = Array.from({ length: 5001 }, (_, index) => `x = ${index};`);
    const [whole] = syntaxSources([], {
      path: 'a.ts',
      binary: false,
      content: lines.join('\n'),
    });
    assert.deepStrictEqual(whole.lines, lines.slice(0, 5000));
    assert.strictEqual(whole.keys.length, 5000);
    const [added] = syntaxSources(
      parsePatch(
        [
          'diff --git a/a.ts b/a.ts',
          'new file mode 100644',
          '--- /dev/null',
          '+++ b/a.ts',
          '@@ -0,0 +1,5001 @@',
          ...lines.map((line) => `+${line}`),
          '',
        ].join('\n'),
      ),
      undefined,
    );
    assert.deepStrictEqual(added.lines, lines.slice(0, 5000));
    assert.strictEqual(added.keys.length, 5000);
  });

  test('colors a line of 20000 characters, but not one over 20000, as VS Code does, as minified lines take long to tokenize', async () => {
    assert.deepStrictEqual(
      await colored([], {
        path: 'a.ts',
        binary: false,
        content: `a = ${'1'.repeat(19996)}\na = ${'1'.repeat(19997)}`,
      }),
      {
        '0:0': ['keyword =', `number ${'1'.repeat(19996)}`],
        '0:1': [],
      },
    );
  });

  test('colors a line of 20000 characters ending a CRLF text', async () => {
    const line = `a = ${'1'.repeat(19996)}`;
    assert.deepStrictEqual(
      await colored([], {
        path: 'a.ts',
        binary: false,
        content: `${line}\r\n${line}\r\n`,
      }),
      {
        '0:0': ['keyword =', `number ${'1'.repeat(19996)}`],
        '0:1': ['keyword =', `number ${'1'.repeat(19996)}`],
      },
    );
  });

  test('colors a side from its hunks alone when its whole text does not match them', async () => {
    const texts = loadedTexts([
      ['new:a.ts', 'other\ntext\nnew = 3;\nend */\n'],
    ]);
    assert.deepStrictEqual(
      await colored(parsePatch(gappedPatch), undefined, texts),
      {
        '0:0': ['keyword =', 'number 1', 'keyword ;'],
        '0:1': ['keyword new', 'keyword =', 'number 2', 'keyword ;'],
        '0:2': ['keyword */'],
      },
    );
  });

  test('colors a side whose blob changed once its new whole text comes, rather than from its hunks alone before it, keeping the colors its lines had meanwhile, and a side whose text it has at once', () => {
    const files = parsePatch(gappedPatch);
    const oldText = '/* start\nmiddle\nold = 1;\nend */\n';
    const texts = loadedTexts([['old:a.ts', oldText]]);
    const sides = (loaded: ReadonlyMap<string, LoadedText>) =>
      syntaxSources(files, undefined, loaded).map((source) => source.lines);
    assert.deepStrictEqual(sides(texts), [
      ['/* start', 'middle', 'old = 1;', 'end */'],
      ['new = 2;', 'end */'],
    ]);
    const changed = new Map(texts).set('new:a.ts', {
      blob: '3'.repeat(40),
      text: '/* start\nmiddle\nnew = 3;\nend */\n',
    });
    assert.deepStrictEqual(sides(changed), [
      ['/* start', 'middle', 'old = 1;', 'end */'],
    ]);
    const unreadable = new Map(texts).set('new:a.ts', {
      blob: blobs.new,
      text: undefined,
    });
    assert.deepStrictEqual(sides(unreadable), sides(texts));
  });

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

  test('colors no file that is collapsed', () => {
    const files = parsePatch(
      ['a.ts', 'b.ts']
        .flatMap((path) => [
          `diff --git a/${path} b/${path}`,
          '@@ -0,0 +1 @@',
          `+let ${path[0]};`,
        ])
        .concat('')
        .join('\n'),
    );
    assert.deepStrictEqual(
      syntaxSources(files, undefined, new Map(), new Set([1])).map(
        (source) => source.lines,
      ),
      [['let b;']],
    );
  });

  test('colors sides from their hunks alone once the sides before take 20000 lines', () => {
    const filler = Array.from({ length: 4999 }, () => 'x;');
    const texts = loadedTexts(
      paths.flatMap((path) =>
        ['old', 'new'].map(
          (side) =>
            [`${side}:${path}`, [...filler, `${side};`].join('\n')] as const,
        ),
      ),
    );
    assert.deepStrictEqual(
      syntaxSources(farFiles, undefined, texts).map(
        (source) => source.lines.length,
      ),
      [5000, 5000, 5000, 5000, 1, 1],
    );
  });
});
