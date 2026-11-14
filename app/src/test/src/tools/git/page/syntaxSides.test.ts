import * as assert from 'node:assert';
import { createElement, Fragment, useLayoutEffect } from 'react';
import { suite, test } from 'vitest';
import {
  parsePatch,
  type LoadedText,
} from '../../../../../tools/git/page/diff';
import type { TextRequest } from '../../../../../tools/git/shared/protocol';
import {
  keepColors,
  keptColorsOf,
  syntaxSources,
  usePrefetchedColors,
  useSyntax,
  useTextsToLoad,
} from '../../../../../tools/git/page/syntax';
import type { SyntaxRange } from '../../../../../lib/page/syntaxEngine';
import { packedPart } from '../../../../../lib/page/syntaxParts';
import {
  workerSeen,
  inPage,
  answered,
  comment,
  colored,
  blobs,
  loadedTexts,
  linesColored,
  warmsUpTheGrammar,
  gappedPatch,
} from './syntaxFixtures';

const keptPatch = (oldBlob: string, newBlob: string) =>
  parsePatch(
    gappedPatch.replace(
      `${blobs.old}..${blobs.new}`,
      `${oldBlob.repeat(40)}..${newBlob.repeat(40)}`,
    ),
  );

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

  test('colors the shown lines of a side by the colors kept of the whole text of its blob, found by their numbers, keeping the longer of two in the language colored, and forgetting the least recently used beyond 200000 lines', () => {
    const files = keptPatch('3', '4');
    const lines = [comment(8), comment(6), comment(8), comment(6)];
    keepColors('typescript', '4'.repeat(40), packedPart(lines, 0, true), 10);
    keepColors(
      'typescript',
      '4'.repeat(40),
      packedPart(lines.slice(0, 2), 0, true),
      10,
    );
    assert.deepStrictEqual(Object.fromEntries(keptColorsOf(files)), {
      '0:1': lines[2],
      '0:2': lines[3],
    });
    assert.deepStrictEqual(keptColorsOf(files, undefined, 'json').size, 0);
    keepColors(
      'typescript',
      '5'.repeat(40),
      packedPart(
        Array.from({ length: 199_996 }, () => []),
        0,
        true,
      ),
      10,
    );
    assert.deepStrictEqual(keptColorsOf(keptPatch('9', '5')).size, 2);
    assert.deepStrictEqual(keptColorsOf(files).size, 2);
    keepColors('typescript', '6'.repeat(40), packedPart([[]], 0, true), 10);
    assert.deepStrictEqual(keptColorsOf(keptPatch('9', '5')).size, 0);
    assert.deepStrictEqual(keptColorsOf(files).size, 2);
  });

  test('forgets the colors kept of a language from before a language it embeds loaded once colors of it come from after, keeping those of the other languages', () => {
    const part = packedPart([[], [], comment(8), comment(6)], 0, true);
    keepColors('typescript', 'a'.repeat(40), part, 20);
    keepColors('json', 'c'.repeat(40), part, 99);
    assert.deepStrictEqual(keptColorsOf(keptPatch('9', 'a')).size, 2);
    keepColors('typescript', 'b'.repeat(40), part, 21);
    assert.deepStrictEqual(keptColorsOf(keptPatch('9', 'a')).size, 0);
    assert.deepStrictEqual(keptColorsOf(keptPatch('9', 'b')).size, 2);
  });

  test('asks for the whole texts of a diff in the commit that shows it, before the window paints, rather than after, so they come a frame sooner', async () => {
    const files = parsePatch(gappedPatch);
    const asked: TextRequest[][] = [];
    let askedBeforePaint: boolean | undefined;
    const texts = new Map<string, LoadedText>();
    const open = new Set([0]);
    const ask = (load: TextRequest[]) => asked.push(load);
    function Asking() {
      useTextsToLoad(files, undefined, 1, open, texts, undefined, ask);
      return null;
    }
    function Painted() {
      useLayoutEffect(() => {
        askedBeforePaint = asked.length > 0;
      }, []);
      return null;
    }
    await inPage(async (render) => {
      await render(
        createElement(
          Fragment,
          null,
          createElement(Asking),
          createElement(Painted),
        ),
      );
    });
    assert.strictEqual(askedBeforePaint, true);
    assert.deepStrictEqual(asked, [
      [
        { path: 'a.ts', side: 'old', blob: blobs.old },
        { path: 'a.ts', side: 'new', blob: blobs.new },
      ],
    ]);
  });

  test('colors a diff by the colors kept of its blobs in the render before its first paint, rather than once the worker answers, the colors the worker gives from the hunks alone not taking their place unless they come from after a language loaded', async () => {
    const files = keptPatch('7', '8');
    const lines = [comment(8), comment(6), comment(8), comment(6)];
    keepColors('typescript', '8'.repeat(40), packedPart(lines, 0, true), 30);
    workerSeen.posted.length = 0;
    await inPage(async (render) => {
      const shown: ReadonlyMap<string, readonly SyntaxRange[]>[] = [];
      const texts = new Map<string, LoadedText>();
      const open = new Set([0]);
      function Diff() {
        shown.push(useSyntax(files, undefined, texts, open));
        return null;
      }
      await render(createElement(Diff));
      assert.deepStrictEqual(Object.fromEntries(shown.at(-1) ?? []), {
        '0:1': lines[2],
        '0:2': lines[3],
      });
      const job = workerSeen.posted.find(
        (message) => message.type === 'color',
      )?.job;
      assert.ok(job !== undefined);
      const keyword = [{ start: 0, end: 3, kind: 'keyword' as const }];
      await answered({
        type: 'colors',
        job,
        generations: { typescript: 30 },
        ranges: [
          ['0:0', keyword],
          ['0:1', keyword],
        ],
      });
      assert.deepStrictEqual(Object.fromEntries(shown.at(-1) ?? []), {
        '0:0': keyword,
        '0:1': lines[2],
        '0:2': lines[3],
      });
      await answered({
        type: 'colors',
        job,
        generations: { typescript: 31, json: 100 },
        ranges: [['0:2', keyword]],
      });
      assert.deepStrictEqual(Object.fromEntries(shown.at(-1) ?? []), {
        '0:0': keyword,
        '0:1': lines[2],
        '0:2': keyword,
      });
    });
  });

  test('colors a diff read ahead in the background, keeping the colors of each whole text by its blob, so the diff is colored in its first frame once it is shown', async () => {
    const patch = gappedPatch.replace(
      `${blobs.old}..${blobs.new}`,
      `${'c'.repeat(40)}..${'d'.repeat(40)}`,
    );
    const texts = new Map<string, LoadedText>([
      [
        'old:a.ts',
        { blob: 'c'.repeat(40), text: '/* start\nmiddle\nold = 1;\nend */\n' },
      ],
      [
        'new:a.ts',
        { blob: 'd'.repeat(40), text: '/* start\nmiddle\nnew = 2;\nend */\n' },
      ],
    ]);
    const colors = [[], [], comment(8), comment(6)];
    workerSeen.posted.length = 0;
    function Ahead() {
      usePrefetchedColors(patch, texts, true);
      return null;
    }
    await inPage(async (render) => {
      await render(createElement(Ahead));
      const asked = workerSeen.posted.find(
        (message) => message.type === 'color',
      );
      assert.ok(asked?.type === 'color');
      assert.strictEqual(asked.background, true);
      const newSide = asked.sources.findIndex(
        ({ lines }) => lines[2] === 'new = 2;',
      );
      await answered({
        type: 'entire',
        job: asked.job,
        generation: 40,
        source: newSide,
        part: packedPart(colors, 0, true),
      });
    });
    assert.deepStrictEqual(
      Object.fromEntries(keptColorsOf(parsePatch(patch))),
      {
        '0:1': colors[2],
        '0:2': colors[3],
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
});
