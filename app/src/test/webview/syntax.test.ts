import * as assert from 'node:assert';
import { parsePatch } from '../../webview/diff';
import {
  languageOf,
  loadLanguages,
  uncachedSources,
  startColoring,
  syntaxSources,
  textsToLoad,
  tokenizing,
  type SyntaxRange,
} from '../../webview/syntax';

type Highlighter = Awaited<ReturnType<typeof loadLanguages>>;

function syntaxRanges(
  highlighter: Highlighter,
  sources: Parameters<typeof uncachedSources>[0],
) {
  const ranges = new Map<string, readonly SyntaxRange[]>();
  tokenizing(highlighter, uncachedSources(sources, ranges))(Infinity, ranges);
  return ranges;
}

async function assertNotLoaded(language: string) {
  assert.ok(
    !(await loadLanguages([])).getLoadedLanguages().includes(language),
    `${language} was loaded before this test, so it cannot see it load`,
  );
}

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
    [...syntaxRanges(highlighter, sources)].map(([key, ranges]) => [
      key,
      ranges.map(
        (range) =>
          `${range.kind} ${texts.get(key)?.slice(range.start, range.end)}`,
      ),
    ]),
  );
}

suite('Syntax', () => {
  // Shiki gives up on a line past 500 ms, leaving the rest of it one token,
  // which the first lines a cold grammar tokenizes took on a slow runner
  suiteSetup(async function () {
    this.timeout(30_000);
    const highlighter = await loadLanguages(['typescript']);
    highlighter.codeToTokensBase(
      "/** a */ let s = 'x' + `y${1}` + /z/g; // c\nclass C<T> { m(): T[] { return []; } }",
      { lang: 'typescript', theme: highlighter.getLoadedThemes()[0] },
    );
  });

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

  test('colors a line of 2000 characters, but not one over 2000', async () => {
    assert.deepStrictEqual(
      await colored([], {
        path: 'a.ts',
        binary: false,
        content: `a = ${'1'.repeat(1996)}\na = ${'1'.repeat(1997)}`,
      }),
      {
        '0:0': ['keyword =', `number ${'1'.repeat(1996)}`],
        '0:1': [],
      },
    );
  });

  test('colors a line of 2000 characters ending a CRLF text', async () => {
    const line = `a = ${'1'.repeat(1996)}`;
    assert.deepStrictEqual(
      await colored([], {
        path: 'a.ts',
        binary: false,
        content: `${line}\r\n${line}\r\n`,
      }),
      {
        '0:0': ['keyword =', `number ${'1'.repeat(1996)}`],
        '0:1': ['keyword =', `number ${'1'.repeat(1996)}`],
      },
    );
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
    const ranges = syntaxRanges(counting, [
      { language: 'typescript', lines, keys: [undefined, '3:7'] },
    ]);
    assert.strictEqual(tokenized, 1);
    assert.deepStrictEqual(Object.fromEntries(ranges), {
      '3:7': [{ start: 4, end: 5, kind: 'keyword' }],
    });
  });

  test('colors at once only the texts colored before, tokenizing the rest a slice at a time after', async () => {
    const highlighter = await loadLanguages(['typescript']);
    const [seen, first, second] = ['seen', 'first', 'second'].map(
      (name, index) => ({
        language: 'typescript',
        lines: [`let ${name}Later = 1;`],
        keys: [`${index}:0`],
      }),
    );
    syntaxRanges(highlighter, [seen]);
    const ranges = new Map<string, readonly SyntaxRange[]>();
    const slices: (() => void)[] = [];
    let published = 0;
    const now = performance.now.bind(performance);
    performance.now = () => 0;
    try {
      startColoring(
        [first, seen, second],
        ranges,
        () => (published += 1),
        (slice) => slices.push(slice),
      );
      assert.deepStrictEqual([...ranges.keys()], ['0:0']);
      assert.strictEqual(published, 1);
      while (slices.length > 0) {
        slices.shift()?.();
      }
    } finally {
      performance.now = now;
    }
    assert.deepStrictEqual([...ranges.keys()], ['0:0', '1:0', '2:0']);
    assert.strictEqual(published, 2);
  });

  test('colors the texts of the languages loaded while it loads the others', async () => {
    await assertNotLoaded('rust');
    await loadLanguages(['typescript']);
    const ranges = new Map<string, readonly SyntaxRange[]>();
    const slices: (() => void)[] = [];
    const run = () => {
      while (slices.length > 0) {
        slices.shift()?.();
      }
    };
    startColoring(
      [
        { language: 'typescript', lines: ['let loadedNow;'], keys: ['0:0'] },
        { language: 'rust', lines: ['let later = 1;'], keys: ['1:0'] },
      ],
      ranges,
      () => {},
      (slice) => slices.push(slice),
    );
    run();
    assert.deepStrictEqual([...ranges.keys()], ['0:0']);
    await loadLanguages(['rust']);
    run();
    assert.deepStrictEqual([...ranges.keys()].toSorted(), ['0:0', '1:0']);
  });

  test('colors nothing more once stopped, though slices are left and a language loads', async () => {
    await assertNotLoaded('toml');
    await loadLanguages(['typescript']);
    const ranges = new Map<string, readonly SyntaxRange[]>();
    const slices: (() => void)[] = [];
    let published = 0;
    const stop = startColoring(
      [
        { language: 'typescript', lines: ['let stopped;'], keys: ['0:0'] },
        { language: 'toml', lines: ['stopped = 1'], keys: ['1:0'] },
      ],
      ranges,
      () => (published += 1),
      (slice) => slices.push(slice),
    );
    stop();
    await loadLanguages(['toml']);
    assert.strictEqual(slices.length, 1);
    slices.shift()?.();
    assert.deepStrictEqual([slices.length, published, ranges.size], [0, 1, 0]);
  });

  test('drops the slices of a job started over once a language loads, as the new job colors every text anew', async () => {
    await assertNotLoaded('go');
    await loadLanguages(['typescript']);
    const ranges = new Map<string, readonly SyntaxRange[]>();
    const slices: (() => void)[] = [];
    let published = 0;
    startColoring(
      [
        { language: 'typescript', lines: ['let superseded;'], keys: ['0:0'] },
        { language: 'go', lines: ['var later = 1'], keys: ['1:0'] },
      ],
      ranges,
      () => (published += 1),
      (slice) => slices.push(slice),
    );
    await loadLanguages(['go']);
    assert.strictEqual(slices.length, 2);
    slices.shift()?.();
    assert.deepStrictEqual([slices.length, published, ranges.size], [1, 1, 0]);
    while (slices.length > 0) {
      slices.shift()?.();
    }
    assert.deepStrictEqual([...ranges.keys()].toSorted(), ['0:0', '1:0']);
  });

  test('tokenizes past its deadline only a few thousand characters of a text, going on from where they leave off', async () => {
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
    const lines = ['/* start', ...Array<string>(3000).fill('x'), '*/ x;'];
    const long = {
      language: 'typescript',
      lines,
      keys: lines.map((_, index) => `0:${index}`),
    };
    const short = { language: 'typescript', lines: ['let y;'], keys: ['1:0'] };
    const ranges = new Map<string, readonly SyntaxRange[]>();
    const step = tokenizing(counting, uncachedSources([long, short], ranges));
    let slices = 1;
    while (step(0, ranges)) {
      assert.ok(!ranges.has('1:0'));
      slices += 1;
    }
    assert.strictEqual(tokenized, slices);
    assert.ok(slices > 2);
    assert.deepStrictEqual(ranges.get('0:3000'), [
      { start: 0, end: 1, kind: 'comment' },
    ]);
    assert.deepStrictEqual(ranges.get('0:3001'), [
      { start: 0, end: 2, kind: 'comment' },
      { start: 4, end: 5, kind: 'keyword' },
    ]);
    assert.deepStrictEqual(ranges.get('1:0')?.length, 2);
  });

  test('colors code in a Markdown fence anew once its language loads', async () => {
    await assertNotLoaded('python');
    const fence = {
      language: 'markdown',
      lines: ['```python', 'def f(): pass', '```'],
      keys: ['0:0', '0:1', '0:2'],
    };
    const before = syntaxRanges(await loadLanguages(['markdown']), [fence]);
    assert.deepStrictEqual(before.get('0:1'), []);
    const after = syntaxRanges(await loadLanguages(['python']), [fence]);
    assert.deepStrictEqual(after.get('0:1')?.[0], {
      start: 0,
      end: 3,
      kind: 'keyword',
    });
  });

  test('tokenizes a text anew from its start when a language another embeds loads while it is half done', async () => {
    await assertNotLoaded('javascript');
    const lines = [
      '# T',
      '',
      '> quote',
      '> - item `x`',
      '>   <div>',
      '>   ```js',
      ...Array<string>(400).fill('>   let a = 1'),
      '>   ```',
      '> more **bold** text',
      '',
      'plain [link](u) `code`',
    ];
    const text = {
      language: 'markdown',
      lines,
      keys: lines.map((_, index) => `0:${index}`),
    };
    const ranges = new Map<string, readonly SyntaxRange[]>();
    const step = tokenizing(
      await loadLanguages(['markdown']),
      uncachedSources([text], ranges),
    );
    const letColored = () =>
      ranges
        .get('0:6')
        ?.some(({ start, kind }) => start === 4 && kind === 'keyword');
    assert.ok(step(-Infinity, ranges));
    assert.strictEqual(letColored(), false);
    const highlighter = await loadLanguages(['javascript']);
    step(Infinity, ranges);
    assert.strictEqual(letColored(), true);
    assert.deepStrictEqual(ranges, syntaxRanges(highlighter, [text]));
  });

  test('keeps the colors of texts of at most 8 million characters in all, forgetting the least recently used, and of none longer than 2 million', async () => {
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
    const color = (name: string, length = 2_000_000) =>
      syntaxRanges(counting, [
        {
          language: 'typescript',
          lines: [name.padEnd(length, ' ')],
          keys: ['0:0'],
        },
      ]);
    for (const name of ['a', 'b', 'c', 'd', 'e', 'b', 'a', 'b']) {
      color(name);
    }
    color('f', 2_000_001);
    color('f', 2_000_001);
    assert.deepStrictEqual(tokenized, ['a', 'b', 'c', 'd', 'e', 'a', 'f', 'f']);
  });

  test('keeps the colors of at most 100000 lines in all', async () => {
    const highlighter = await loadLanguages(['typescript']);
    const tokenized: string[] = [];
    const counting = {
      ...highlighter,
      codeToTokensBase: (
        ...args: Parameters<typeof highlighter.codeToTokensBase>
      ) => {
        tokenized.push(args[0]);
        return highlighter.codeToTokensBase(...args);
      },
    };
    const color = (name: string, length = 50_000) =>
      syntaxRanges(counting, [
        {
          language: 'typescript',
          lines: [name, ...Array<string>(length - 1).fill('')],
          keys: ['0:0'],
        },
      ]);
    for (const name of ['a', 'b', 'a']) {
      color(name);
    }
    color('c', 1);
    for (const name of ['a', 'b', 'a']) {
      color(name);
    }
    assert.deepStrictEqual(
      tokenized.flatMap((text) => (/^\w/.test(text) ? [text[0]] : [])),
      ['a', 'b', 'c', 'b'],
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

  const paths = ['a.ts', 'b.ts', 'c.ts'];
  const farFiles = parsePatch(
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

  const farRequests = (open?: ReadonlySet<number>) =>
    textsToLoad(farFiles, 1, new Set(), open).map(
      ({ path, side }) => `${side}:${path}`,
    );

  test('colors sides from their hunks alone once the sides before take 20000 lines', () => {
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
      syntaxSources(farFiles, undefined, texts).map(
        (source) => source.lines.length,
      ),
      [5000, 5000, 5000, 5000, 1, 1],
    );
  });

  test('asks for the whole texts of open files only, as long as the sides before take less than 20000 lines', () => {
    assert.deepStrictEqual(farRequests(), [
      'old:a.ts',
      'new:a.ts',
      'old:b.ts',
      'new:b.ts',
    ]);
    assert.deepStrictEqual(farRequests(new Set([2])), ['old:c.ts', 'new:c.ts']);
  });

  test('counts a side colored from its hunks alone by at most the 5000 lines it colors', () => {
    const added = parsePatch(
      [
        'diff --git a/added.ts b/added.ts',
        'new file mode 100644',
        'index 0000000000000000000000000000000000000000..3333333333333333333333333333333333333333',
        '--- /dev/null',
        '+++ b/added.ts',
        '@@ -0,0 +1,20000 @@',
        ...Array.from({ length: 20_000 }, () => '+x;'),
        '',
      ].join('\n'),
    );
    assert.deepStrictEqual(
      textsToLoad([...added, ...farFiles.slice(0, 1)], 1, new Set()).map(
        ({ path, side }) => `${side}:${path}`,
      ),
      ['old:a.ts', 'new:a.ts'],
    );
  });
});
