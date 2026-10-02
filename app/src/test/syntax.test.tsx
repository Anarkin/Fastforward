import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { parsePatch } from '../webview/diff';
import { marked } from '../webview/diffView';
import {
  languageOf,
  loadLanguages,
  syntaxRanges,
  syntaxSources,
  textsToLoad,
} from '../webview/syntax';

async function colored(
  ...args: Parameters<typeof syntaxSources>
): Promise<Record<string, string[]>> {
  const sources = syntaxSources(...args);
  const highlighter = await loadLanguages(sources.map((s) => s.language));
  const texts = new Map(
    sources.flatMap((source) =>
      source.keys.map((key, index) => [key, source.lines[index]] as const),
    ),
  );
  return Object.fromEntries(
    [...syntaxRanges(highlighter, sources).ranges].map(([key, ranges]) => [
      key,
      ranges.map(
        (range) =>
          `${range.kind} ${texts.get(key)?.slice(range.start, range.end)}`,
      ),
    ]),
  );
}

suite('Syntax', () => {
  test('knows the language from the file name', () => {
    assert.strictEqual(languageOf('src/app.ts'), 'typescript');
    assert.strictEqual(languageOf('esbuild.mjs'), 'javascript');
    assert.strictEqual(languageOf('docs/README.md'), 'markdown');
    assert.strictEqual(languageOf('lib/Program.CS'), 'csharp');
    assert.strictEqual(languageOf('Dockerfile'), 'docker');
    assert.strictEqual(languageOf('notes.unknown'), undefined);
    assert.strictEqual(languageOf('LICENSE'), undefined);
  });

  test('colors the keywords, punctuation, strings, numbers and comments of a file shown entire, leaving code in a string plain', async () => {
    assert.deepStrictEqual(
      await colored([], {
        path: 'a.ts',
        binary: false,
        content: "const a = 'x'; // note\nreturn `n${b + 1}`;\n",
      }),
      {
        '0:0': [
          'keyword const',
          'keyword =',
          "keyword '",
          'string x',
          "keyword ';",
          'comment // note',
        ],
        '0:1': [
          'keyword return',
          'keyword `',
          'string n',
          'keyword ${',
          'keyword +',
          'number 1',
          'keyword }`;',
        ],
      },
    );
  });

  test('colors the types, their declarations, uses and built-ins alike', async () => {
    assert.deepStrictEqual(
      await colored([], {
        path: 'a.ts',
        binary: false,
        content: [
          'interface A {}',
          'class B extends C implements A {}',
          'let n: Map<B, string>;',
        ].join('\n'),
      }),
      {
        '0:0': ['keyword interface', 'type A', 'keyword {}'],
        '0:1': [
          'keyword class',
          'type B',
          'keyword extends',
          'type C',
          'keyword implements',
          'type A',
          'keyword {}',
        ],
        '0:2': [
          'keyword let',
          'keyword :',
          'type Map',
          'keyword <',
          'type B',
          'keyword ,',
          'type string',
          'keyword >;',
        ],
      },
    );
  });

  test('colors the functions where declared and where called', async () => {
    assert.deepStrictEqual(
      await colored([], {
        path: 'a.ts',
        binary: false,
        content: 'function f(a) { return a.trim() + parseInt(a); }',
      }),
      {
        '0:0': [
          'keyword function',
          'function f',
          'keyword (',
          'keyword )',
          'keyword {',
          'keyword return',
          'keyword .',
          'function trim',
          'keyword ()',
          'keyword +',
          'function parseInt',
          'keyword (',
          'keyword );',
          'keyword }',
        ],
      },
    );
  });

  test('leaves the keys of JSON plain, quotes and all', async () => {
    assert.deepStrictEqual(
      await colored([], {
        path: 'settings.json',
        binary: false,
        content: '{ "solo": false, "size": "12px\\n", "count": 2 }',
      }),
      {
        '0:0': [
          'keyword {',
          'keyword :',
          'keyword false,',
          'keyword :',
          'keyword "',
          'string 12px',
          'keyword \\n",',
          'keyword :',
          'number 2',
          'keyword }',
        ],
      },
    );
  });

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

  const gappedPatch = [
    'diff --git a/a.ts b/a.ts',
    'index 1111111111111111111111111111111111111111..2222222222222222222222222222222222222222 100644',
    '--- a/a.ts',
    '+++ b/a.ts',
    '@@ -3,2 +3,2 @@',
    '-old = 1;',
    '+new = 2;',
    ' end */',
    '',
  ].join('\n');

  test('colors a hunk starting inside a comment as the whole text of each side has it', async () => {
    const texts = new Map([
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
    const texts = new Map([
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

  test('colors a side from its hunks alone when they are too far into its whole text', () => {
    const far = 5001;
    const text = Array.from({ length: far + 1 }, (_, index) =>
      index === far - 1 ? 'new = 2;' : 'x;',
    ).join('\n');
    const farPatch = [
      'diff --git a/a.ts b/a.ts',
      'index 1111111111111111111111111111111111111111..2222222222222222222222222222222222222222 100644',
      '--- a/a.ts',
      '+++ b/a.ts',
      `@@ -${far},1 +${far},1 @@`,
      '-old = 1;',
      '+new = 2;',
      '',
    ].join('\n');
    const sources = syntaxSources(
      parsePatch(farPatch),
      undefined,
      new Map([['new:a.ts', text]]),
    );
    assert.deepStrictEqual(
      sources.map((source) => source.lines),
      [['old = 1;'], ['new = 2;']],
    );
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

  test('colors a side from its hunks alone when its whole text does not match them', async () => {
    const texts = new Map([['new:a.ts', 'other\ntext\nnew = 3;\nend */\n']]);
    assert.deepStrictEqual(
      await colored(parsePatch(gappedPatch), undefined, texts),
      {
        '0:0': ['keyword =', 'number 1', 'keyword ;'],
        '0:1': ['keyword new', 'keyword =', 'number 2', 'keyword ;'],
        '0:2': ['keyword */'],
      },
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

  test('tokenizes a text it has colored before only once, keying its lines anew', async () => {
    const highlighter = await loadLanguages(['typescript']);
    let tokenized = 0;
    const counting = {
      ...highlighter,
      codeToTokensBase: (
        ...args: Parameters<typeof highlighter.codeToTokensBase>
      ) => {
        tokenized += 1;
        return highlighter.codeToTokensBase(...args);
      },
    };
    const lines = ['let once = 1;', 'once;'];
    syntaxRanges(counting, [
      { language: 'typescript', lines, keys: ['0:0', '0:1'] },
    ]);
    const { ranges } = syntaxRanges(counting, [
      { language: 'typescript', lines, keys: [undefined, '3:7'] },
    ]);
    assert.strictEqual(tokenized, 1);
    assert.deepStrictEqual(Object.fromEntries(ranges), {
      '3:7': [{ start: 4, end: 5, kind: 'keyword' }],
    });
  });

  test('tokenizes past its deadline only the first text not tokenized before, leaving the rest for later', async () => {
    const highlighter = await loadLanguages(['typescript']);
    const [seen, first, second, third] = [
      'seen',
      'first',
      'second',
      'third',
    ].map((name, index) => ({
      language: 'typescript',
      lines: [`let ${name}Late = 1;`],
      keys: [`${index}:0`],
    }));
    syntaxRanges(highlighter, [seen]);
    const { ranges, rest } = syntaxRanges(
      highlighter,
      [first, second, seen, third],
      0,
    );
    assert.deepStrictEqual([...ranges.keys()], ['1:0', '0:0']);
    assert.deepStrictEqual(rest, [second, third]);
  });

  test('colors code in a Markdown fence anew once its language loads', async () => {
    const fence = {
      language: 'markdown',
      lines: ['```python', 'def f(): pass', '```'],
      keys: ['0:0', '0:1', '0:2'],
    };
    const before = syntaxRanges(await loadLanguages(['markdown']), [fence]);
    assert.deepStrictEqual(before.ranges.get('0:1'), []);
    const after = syntaxRanges(await loadLanguages(['python']), [fence]);
    assert.deepStrictEqual(after.ranges.get('0:1')?.[0], {
      start: 0,
      end: 3,
      kind: 'keyword',
    });
  });

  test('keeps the colors of texts of at most 8 million characters in all, and of none longer than 2 million', async () => {
    const highlighter = await loadLanguages(['typescript']);
    const tokenized: string[] = [];
    const counting = {
      ...highlighter,
      codeToTokensBase: (
        ...args: Parameters<typeof highlighter.codeToTokensBase>
      ) => {
        tokenized.push(args[0][0]);
        return highlighter.codeToTokensBase(...args);
      },
    };
    const color = (name: string, length = 1_999_000) =>
      syntaxRanges(counting, [
        {
          language: 'typescript',
          lines: [name.padEnd(length, ' ')],
          keys: ['0:0'],
        },
      ]);
    for (const name of ['a', 'b', 'c', 'd', 'e', 'b', 'a']) {
      color(name);
    }
    color('f', 2_000_001);
    color('f', 2_000_001);
    assert.deepStrictEqual(tokenized, ['a', 'b', 'c', 'd', 'e', 'a', 'f', 'f']);
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
    const paths = ['a.ts', 'b.ts', 'c.ts'];
    const files = parsePatch(
      paths
        .flatMap((path) => [
          `diff --git a/${path} b/${path}`,
          'index 1111111111111111111111111111111111111111..2222222222222222222222222222222222222222 100644',
          '@@ -5000,1 +5000,1 @@',
          '-old;',
          '+new;',
        ])
        .concat('')
        .join('\n'),
    );
    const filler = Array.from({ length: 4999 }, () => 'x;');
    const texts = new Map(
      paths.flatMap((path) =>
        ['old', 'new'].map(
          (side) =>
            [`${side}:${path}`, [...filler, `${side};`].join('\n')] as const,
        ),
      ),
    );
    assert.deepStrictEqual(
      syntaxSources(files, undefined, texts).map(
        (source) => source.lines.length,
      ),
      [5000, 5000, 5000, 5000, 1, 1],
    );
  });

  test('draws the syntax colors inside the changed words, under the search matches', () => {
    assert.strictEqual(
      renderToStaticMarkup(
        <>
          {marked(
            'let sum = 1',
            [
              { start: 0, end: 3, kind: 'keyword' },
              { start: 10, end: 11, kind: 'number' },
            ],
            [{ start: 0, end: 7 }],
            'word-added',
            [{ start: 2, end: 5 }],
            undefined,
          )}
        </>,
      ),
      '<span class="word-added"><span class="syntax-keyword">le</span></span>' +
        '<span class="word-added"><span class="syntax-keyword"><mark class="find-match ">t</mark></span></span>' +
        '<span class="word-added"><mark class="find-match "> s</mark></span>' +
        '<span class="word-added">um</span> = <span class="syntax-number">1</span>',
    );
  });
});
