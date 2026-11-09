import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act, createElement, Fragment, useLayoutEffect } from 'react';
import { beforeAll, suite, test } from 'vitest';
import { parsePatch, type LoadedText } from '../../../../tools/git/page/diff';
import type { TextRequest } from '../../../../tools/git/shared/protocol';
import {
  carriedRanges,
  keepColors,
  keptColorsOf,
  startingRanges,
  languageOf,
  syntaxSources,
  textsToLoad,
  useSyntax,
  useTextsToLoad,
} from '../../../../tools/git/page/syntax';
import {
  codeSegments,
  colorerOf,
  workerPort,
  type SyntaxPort,
} from '../../../../ui/syntax';
import {
  colorCode,
  loadLanguages,
  sendUncaught,
  serveColoring,
  startColoring,
  tokenizing,
  uncachedSources,
  type FromSyntax,
  type SyntaxRange,
  type ToSyntax,
} from '../../../../ui/syntaxEngine';
import { onceMade } from '../../../../ui/onceMade';
import {
  packedPart,
  partLines,
  type CodePart,
} from '../../../../ui/syntaxParts';
import { policyOfPage, waitFor } from '../../../fixtures';

type Highlighter = Awaited<ReturnType<typeof loadLanguages>>;

function syntaxRanges(
  highlighter: Highlighter,
  sources: Parameters<typeof uncachedSources>[0],
) {
  const ranges = new Map<string, readonly SyntaxRange[]>();
  tokenizing(highlighter, uncachedSources(sources, ranges))(Infinity, ranges);
  return ranges;
}

function countingLines(highlighter: Highlighter) {
  const lines: string[] = [];
  const counting: Highlighter = {
    ...highlighter,
    getLanguage: (...args) => {
      const grammar = highlighter.getLanguage(...args);
      const tokenizeLine2: typeof grammar.tokenizeLine2 = (...line) => {
        lines.push(line[0]);
        return grammar.tokenizeLine2(...line);
      };
      return new Proxy(grammar, {
        get: (target, name) =>
          name === 'tokenizeLine2' ? tokenizeLine2 : Reflect.get(target, name),
      });
    },
  };
  return { counting, tokenized: () => lines.length, lines };
}

const comment = (end: number) => [{ start: 0, end, kind: 'comment' as const }];

const sideKeys = (side: number, lines: readonly string[]) =>
  lines.map((_, index) => `${side}:${index}`);

function onTickingClock(from: number, run: () => void) {
  const now = performance.now.bind(performance);
  let clock = from;
  performance.now = () => (clock += 1);
  try {
    run();
  } finally {
    performance.now = now;
  }
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

const blobs = { old: '1'.repeat(40), new: '2'.repeat(40) };

function loadedTexts(
  texts: readonly (readonly [string, string])[],
): Map<string, LoadedText> {
  return new Map(
    texts.map(([key, text]) => [
      key,
      { blob: key.startsWith('old:') ? blobs.old : blobs.new, text },
    ]),
  );
}

const range = (kind: SyntaxRange['kind']) => [{ start: 0, end: 1, kind }];

const linesColored = (far: number) => {
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
  return syntaxSources(
    parsePatch(farPatch),
    undefined,
    loadedTexts([['new:a.ts', text]]),
  ).map((source) => source.lines);
};

suite('Syntax', () => {
  beforeAll(async function warmUpTheGrammarAsShikiGivesUpOnALinePast500Ms() {
    const highlighter = await loadLanguages(['typescript']);
    highlighter.codeToTokensBase(
      "/** a */ let s = 'x' + `y${1}` + /z/g; // c\nclass C<T> { m(): T[] { return []; } }",
      { lang: 'typescript', theme: highlighter.getLoadedThemes()[0] },
    );
  }, 30_000);

  test('may run the Oniguruma engine by the page policy, as it is WebAssembly, which the tests run without the policy', () => {
    assert.ok(policyOfPage().get('script-src')?.includes("'wasm-unsafe-eval'"));
  });

  test('knows the language of a file without an extension from its name in a Windows path too, as a viewer tab gives the whole path', () => {
    assert.strictEqual(languageOf('C:\\work\\Dockerfile'), 'docker');
    assert.strictEqual(languageOf('C:\\my.work\\Makefile'), 'make');
    assert.strictEqual(languageOf('C:\\my.work\\app.ts'), 'typescript');
  });

  test('knows the language from the file name', () => {
    assert.strictEqual(languageOf('src/app.ts'), 'typescript');
    assert.strictEqual(languageOf('esbuild.mjs'), 'javascript');
    assert.strictEqual(languageOf('legacy.cjs'), 'javascript');
    assert.strictEqual(languageOf('vitest.config.mts'), 'typescript');
    assert.strictEqual(languageOf('types.cts'), 'typescript');
    assert.strictEqual(languageOf('docs/README.md'), 'markdown');
    assert.strictEqual(languageOf('lib/Program.CS'), 'csharp');
    assert.strictEqual(languageOf('Dockerfile'), 'docker');
    assert.strictEqual(languageOf('notes.unknown'), undefined);
    assert.strictEqual(languageOf('LICENSE'), undefined);
  });

  test('knows the files of .NET, Rust, Elixir, Perl and OCaml by the extensions and names their tools give them, though shiki names no language by them', () => {
    for (const [file, language] of [
      ['build.csx', 'csharp'],
      ['Views/Home/Index.cshtml', 'razor'],
      ['script.fsx', 'fsharp'],
      ['Library.fsi', 'fsharp'],
      ['App.fsproj', 'xml'],
      ['Legacy.vbproj', 'xml'],
      ['Playground.slnx', 'xml'],
      ['Package.nuspec', 'xml'],
      ['MainWindow.xaml', 'xml'],
      ['App.axaml', 'xml'],
      ['Resources.resx', 'xml'],
      ['NuGet.Config', 'xml'],
      ['C:\\site\\web.config', 'xml'],
      ['app.config', 'xml'],
      ['packages.config', 'xml'],
      ['Cargo.lock', 'toml'],
      ['.editorconfig', 'ini'],
      ['lib/app.ex', 'elixir'],
      ['test/app_test.exs', 'elixir'],
      ['script.pl', 'perl'],
      ['Module.pm', 'perl'],
      ['main.ml', 'ocaml'],
      ['main.mli', 'ocaml'],
    ] as const) {
      assert.strictEqual(languageOf(file), language, file);
    }
    for (const file of ['settings.config', 'yarn.lock', 'go.mod']) {
      assert.strictEqual(languageOf(file), undefined, file);
    }
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

  test('colors code in Markdown as a string, backticks and all, inline as VS Code does, and indented', async () => {
    assert.deepStrictEqual(
      await colored([], {
        path: 'a.md',
        binary: false,
        content: '# Run `src/<path>` in a [link](x)\n\n    let a = 1;\n',
      }),
      {
        '0:0': [
          'keyword #',
          'string `src/<path>`',
          'keyword [',
          'string link',
          'keyword ](',
          'keyword )',
        ],
        '0:1': [],
        '0:2': ['string     let a = 1;'],
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

  const keptPatch = (oldBlob: string, newBlob: string) =>
    parsePatch(
      gappedPatch.replace(
        `${blobs.old}..${blobs.new}`,
        `${oldBlob.repeat(40)}..${newBlob.repeat(40)}`,
      ),
    );

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
    const dom = new JSDOM('<!doctype html><main></main>');
    const globals = {
      window: dom.window,
      document: dom.window.document,
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    const saved = Object.fromEntries(
      Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
    );
    Object.assign(globalThis, globals);
    try {
      const { createRoot } = await import('react-dom/client');
      const main = dom.window.document.querySelector('main');
      assert.ok(main);
      const root = createRoot(main);
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
      await act(async () => {
        root.render(
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
      await act(async () => {
        root.unmount();
      });
    } finally {
      Object.assign(globalThis, saved);
    }
  });

  test('colors a diff by the colors kept of its blobs in the render before its first paint, rather than once the worker answers, the colors the worker gives from the hunks alone not taking their place unless they come from after a language loaded', async () => {
    const files = keptPatch('7', '8');
    const lines = [comment(8), comment(6), comment(8), comment(6)];
    keepColors('typescript', '8'.repeat(40), packedPart(lines, 0, true), 30);
    const posted: ToSyntax[] = [];
    let answer: ((message: FromSyntax) => void) | undefined;
    const dom = new JSDOM('<!doctype html><main></main>');
    const globals = {
      window: dom.window,
      document: dom.window.document,
      location: new URL('file:///page/index.html'),
      IS_REACT_ACT_ENVIRONMENT: true,
      Worker: class {
        postMessage(message: ToSyntax) {
          posted.push(message);
        }
        addEventListener(
          type: string,
          listener: (event: { data: FromSyntax }) => void,
        ) {
          if (type === 'message') {
            answer = (data) => listener({ data });
          }
        }
      },
    };
    const saved = Object.fromEntries(
      Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
    );
    Object.assign(globalThis, globals);
    try {
      const { createRoot } = await import('react-dom/client');
      const main = dom.window.document.querySelector('main');
      assert.ok(main);
      const root = createRoot(main);
      const shown: ReadonlyMap<string, readonly SyntaxRange[]>[] = [];
      const texts = new Map<string, LoadedText>();
      const open = new Set([0]);
      function Diff() {
        shown.push(useSyntax(files, undefined, texts, open));
        return null;
      }
      await act(async () => {
        root.render(createElement(Diff));
      });
      assert.deepStrictEqual(Object.fromEntries(shown.at(-1) ?? []), {
        '0:1': lines[2],
        '0:2': lines[3],
      });
      const job = posted.find((message) => message.type === 'color')?.job;
      assert.ok(job !== undefined);
      const keyword = [{ start: 0, end: 3, kind: 'keyword' as const }];
      await act(async () => {
        answer?.({
          type: 'colors',
          job,
          generations: { typescript: 30 },
          ranges: [
            ['0:0', keyword],
            ['0:1', keyword],
          ],
        });
      });
      assert.deepStrictEqual(Object.fromEntries(shown.at(-1) ?? []), {
        '0:0': keyword,
        '0:1': lines[2],
        '0:2': lines[3],
      });
      await act(async () => {
        answer?.({
          type: 'colors',
          job,
          generations: { typescript: 31, json: 100 },
          ranges: [['0:2', keyword]],
        });
      });
      assert.deepStrictEqual(Object.fromEntries(shown.at(-1) ?? []), {
        '0:0': keyword,
        '0:1': lines[2],
        '0:2': keyword,
      });
      await act(async () => {
        root.unmount();
      });
    } finally {
      Object.assign(globalThis, saved);
    }
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

  test('tokenizes a text it has colored before only once, keying its lines anew', async () => {
    const { counting, tokenized } = countingLines(
      await loadLanguages(['typescript']),
    );
    const lines = ['let once = 1;', 'once;'];
    syntaxRanges(counting, [
      { language: 'typescript', lines, keys: ['0:0', '0:1'] },
    ]);
    const ranges = syntaxRanges(counting, [
      { language: 'typescript', lines, keys: [undefined, '3:7'] },
    ]);
    assert.strictEqual(tokenized(), lines.length);
    assert.deepStrictEqual(Object.fromEntries(ranges), {
      '3:7': [{ start: 4, end: 5, kind: 'keyword' }],
    });
  });

  test('colors a line as the line of its twin it is unchanged from once the states before them are the same, tokenizing only the lines that differ, as a line colors alike from a like state', async () => {
    const highlighter = await loadLanguages(['typescript']);
    const { counting, lines: tokenized } = countingLines(highlighter);
    const old = ['/* twin', 'end */', 'let kept = 1;', 'kept;'];
    const changed = ['/* twin', 'added', 'end */', 'let kept = 1;', 'kept;'];
    const ranges = syntaxRanges(counting, [
      { language: 'typescript', lines: old, keys: sideKeys(0, old) },
      {
        language: 'typescript',
        lines: changed,
        keys: sideKeys(1, changed),
        twin: { source: 0, lines: [0, undefined, 1, 2, 3] },
      },
    ]);
    assert.deepStrictEqual(tokenized.toSorted(), [...old, 'added'].toSorted());
    const alone = syntaxRanges(highlighter, [
      {
        language: 'typescript',
        lines: [...changed, ''],
        keys: [...sideKeys(1, changed), undefined],
      },
    ]);
    assert.deepStrictEqual(
      sideKeys(1, changed).map((key) => ranges.get(key)),
      sideKeys(1, changed).map((key) => alone.get(key)),
    );
  });

  test('tokenizes a line unchanged from its twin anew when the states before them differ, as a comment opened before it colors it', async () => {
    const { counting, lines: tokenized } = countingLines(
      await loadLanguages(['typescript']),
    );
    const ranges = syntaxRanges(counting, [
      { language: 'typescript', lines: ['let opened = 1;'], keys: ['0:0'] },
      {
        language: 'typescript',
        lines: ['/*', 'let opened = 1;'],
        keys: ['1:0', '1:1'],
        twin: { source: 0, lines: [undefined, 0] },
      },
    ]);
    assert.deepStrictEqual(tokenized.toSorted(), [
      '/*',
      'let opened = 1;',
      'let opened = 1;',
    ]);
    assert.deepStrictEqual(ranges.get('1:1'), [
      { start: 0, end: 15, kind: 'comment' },
    ]);
  });

  test('colors a text and its twin in step, each line of the twin before the line unchanged from it, so both sides of a diff fill in together', async () => {
    const lines = ['stepped;', 'together;', 'down;'];
    const ranges = syntaxRanges(await loadLanguages(['typescript']), [
      { language: 'typescript', lines, keys: ['0:0', '0:1', '0:2'] },
      {
        language: 'typescript',
        lines: [...lines, 'more;'],
        keys: ['1:0', '1:1', '1:2', '1:3'],
        twin: { source: 0, lines: [0, 1, 2, undefined] },
      },
    ]);
    assert.deepStrictEqual(
      [...ranges.keys()],
      ['0:0', '1:0', '0:1', '1:1', '0:2', '1:2', '1:3'],
    );
  });

  test('colors a line as the line of its twin colored before, keeping the state after each line of the twin', async () => {
    const highlighter = await loadLanguages(['typescript']);
    const old = {
      language: 'typescript',
      lines: ['/* before', 'end */', 'let before = 1;'],
      keys: ['0:0', '0:1', '0:2'],
    };
    syntaxRanges(highlighter, [old]);
    const { counting, lines: tokenized } = countingLines(highlighter);
    const ranges = syntaxRanges(counting, [
      old,
      {
        language: 'typescript',
        lines: ['/* before', 'end */', 'let after = 2;', 'let before = 1;'],
        keys: ['1:0', '1:1', '1:2', '1:3'],
        twin: { source: 0, lines: [0, 1, undefined, 2] },
      },
    ]);
    assert.deepStrictEqual(tokenized, ['let after = 2;']);
    assert.deepStrictEqual(ranges.get('1:3'), ranges.get('0:2'));
  });

  test('colors a text beginning as one colored before from where they part, taking the colors of the lines before at once, as a file is cut at its last line shown and the next diff shows it again', async () => {
    const highlighter = await loadLanguages(['typescript']);
    const before = ['/* parted', 'still */', 'let same = 1;', 'let gone = 2;'];
    syntaxRanges(highlighter, [
      { language: 'typescript', lines: before, keys: sideKeys(0, before) },
    ]);
    const { counting, lines: tokenized } = countingLines(highlighter);
    const after = ['/* parted', 'still */', 'let same = 1;', 'let came = 3;'];
    const ranges = new Map<string, readonly SyntaxRange[]>();
    const pending = uncachedSources(
      [{ language: 'typescript', lines: after, keys: sideKeys(1, after) }],
      ranges,
    );
    assert.deepStrictEqual([...ranges.keys()], ['1:0', '1:1', '1:2']);
    tokenizing(counting, pending)(Infinity, ranges);
    assert.deepStrictEqual(tokenized, ['let came = 3;']);
    const alone = syntaxRanges(highlighter, [
      {
        language: 'typescript',
        lines: [...after, ''],
        keys: [...sideKeys(1, after), undefined],
      },
    ]);
    assert.deepStrictEqual(
      sideKeys(1, after).map((key) => ranges.get(key)),
      sideKeys(1, after).map((key) => alone.get(key)),
    );
  });

  test('colors a text that a text colored before begins with at once, tokenizing none of it', async () => {
    const highlighter = await loadLanguages(['typescript']);
    const longer = ['/* cut', 'here */', 'let kept = 1;', 'let cut = 2;'];
    const before = syntaxRanges(highlighter, [
      { language: 'typescript', lines: longer, keys: sideKeys(0, longer) },
    ]);
    const ranges = new Map<string, readonly SyntaxRange[]>();
    const pending = uncachedSources(
      [
        {
          language: 'typescript',
          lines: longer.slice(0, 3),
          keys: sideKeys(1, longer.slice(0, 3)),
        },
      ],
      ranges,
    );
    assert.deepStrictEqual(pending, []);
    assert.deepStrictEqual(
      [...ranges.values()],
      sideKeys(0, longer.slice(0, 3)).map((key) => before.get(key)),
    );
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

  test('shows the colors of its first slice at once, and those after at most once a frame', async () => {
    await loadLanguages(['typescript']);
    const lines = Array<string>(6000).fill('let shownAtOnce = 1;');
    const ranges = new Map<string, readonly SyntaxRange[]>();
    const slices: (() => void)[] = [];
    const shown: number[] = [];
    onTickingClock(performance.now(), () => {
      startColoring(
        [
          {
            language: 'typescript',
            lines,
            keys: lines.map((_, index) => `0:${index}`),
          },
        ],
        ranges,
        () => shown.push(ranges.size),
        (slice) => slices.push(slice),
      );
      slices.shift()?.();
      slices.shift()?.();
    });
    assert.strictEqual(shown.length, 2, String(shown));
    const [, first] = shown;
    assert.ok(first > 0 && first < lines.length, String(first));
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

  test('tokenizes past its deadline only one line of a text, going on from where it leaves off', async () => {
    const { counting, tokenized } = countingLines(
      await loadLanguages(['typescript']),
    );
    const lines = ['/* deadline', ...Array<string>(3000).fill('x'), '*/ x;'];
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
    assert.strictEqual(tokenized(), slices);
    assert.strictEqual(slices, lines.length + 1);
    assert.deepStrictEqual(ranges.get('0:3000'), [
      { start: 0, end: 1, kind: 'comment' },
    ]);
    assert.deepStrictEqual(ranges.get('0:3001'), [
      { start: 0, end: 2, kind: 'comment' },
      { start: 4, end: 5, kind: 'keyword' },
    ]);
    assert.deepStrictEqual(ranges.get('1:0')?.length, 2);
  });

  test('tokenizes an empty line as VS Code does rather than skipping it as shiki does, so a blank line ends a Markdown paragraph and the indented code after it is colored as code', async () => {
    const lines = ['A paragraph', '', '    indented code'];
    const ranges = syntaxRanges(await loadLanguages(['markdown']), [
      { language: 'markdown', lines, keys: sideKeys(0, lines) },
    ]);
    assert.deepStrictEqual(ranges.get('0:2'), [
      { start: 0, end: 17, kind: 'string' },
    ]);
  });

  test('tokenizes an empty line only the first time it follows a state, as the state after it follows from that alone, so the empty lines of a file cost nothing more', async () => {
    const { counting, lines: tokenized } = countingLines(
      await loadLanguages(['typescript']),
    );
    const lines = ['let spaced = 1;', '', '', '', 'spaced;', '', 'end;'];
    syntaxRanges(counting, [
      { language: 'typescript', lines, keys: sideKeys(0, lines) },
    ]);
    assert.deepStrictEqual(tokenized, [
      'let spaced = 1;',
      '',
      'spaced;',
      'end;',
    ]);
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

  test('forgets on loading a language the colors kept of the languages embedding it alone, keeping those of the others, as only they color anew', async () => {
    await assertNotLoaded('lua');
    const highlighter = await loadLanguages(['typescript', 'markdown']);
    const code = {
      language: 'typescript',
      lines: ['let embedsNothing = 1;'],
      keys: ['0:0'],
    };
    const document = {
      language: 'markdown',
      lines: ['# Embeds', '```lua', 'local x = 1', '```'],
      keys: ['1:0', '1:1', '1:2', '1:3'],
    };
    syntaxRanges(highlighter, [code, document]);
    await loadLanguages(['lua']);
    const { counting, lines: tokenized } = countingLines(highlighter);
    syntaxRanges(counting, [code, document]);
    assert.deepStrictEqual(tokenized, document.lines);
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
    while (!ranges.has('0:6')) {
      assert.ok(step(-Infinity, ranges));
    }
    assert.strictEqual(letColored(), false);
    const highlighter = await loadLanguages(['javascript']);
    step(Infinity, ranges);
    assert.strictEqual(letColored(), true);
    assert.deepStrictEqual(ranges, syntaxRanges(highlighter, [text]));
  });

  test('keeps the colors of texts of at most 8 million characters in all, forgetting the least recently used, and of none longer than 2 million, bounding the memory of the page', async () => {
    const { counting, lines: tokenized } = countingLines(
      await loadLanguages(['typescript']),
    );
    const color = (name: string, length = 2_000_000) =>
      syntaxRanges(counting, [
        {
          language: 'typescript',
          lines: [name, ' '.repeat(length - name.length - 1)],
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
    const { counting, lines: tokenized } = countingLines(
      await loadLanguages(['typescript']),
    );
    const color = (name: string, length = 50_000) =>
      syntaxRanges(counting, [
        {
          language: 'typescript',
          lines: [name, ...Array<string>(length - 1).fill('')],
          keys: ['0:0'],
        },
      ]);
    for (const name of ['lines1', 'lines2', 'lines1']) {
      color(name);
    }
    color('lines3', 1);
    for (const name of ['lines1', 'lines2', 'lines1']) {
      color(name);
    }
    assert.deepStrictEqual(
      tokenized.filter((line) => line !== ''),
      ['lines1', 'lines2', 'lines3', 'lines2'],
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

  const requestsAfter = (count: number) =>
    textsToLoad(
      [
        ...parsePatch(
          [
            'diff --git a/added.ts b/added.ts',
            'new file mode 100644',
            'index 0000000000000000000000000000000000000000..3333333333333333333333333333333333333333',
            '--- /dev/null',
            '+++ b/added.ts',
            `@@ -0,0 +1,${count} @@`,
            ...Array.from({ length: count }, () => '+x;'),
            '',
          ].join('\n'),
        ),
        ...farFiles,
      ],
      1,
      new Set(),
    ).map(({ path, side }) => `${side}:${path}`);

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

  test('asks for the whole texts of open files only, as long as the sides before take less than 20000 lines', () => {
    assert.deepStrictEqual(farRequests(), [
      'old:a.ts',
      'new:a.ts',
      'old:b.ts',
      'new:b.ts',
    ]);
    assert.deepStrictEqual(farRequests(new Set([2])), ['old:c.ts', 'new:c.ts']);
  });

  test('asks for whole texts only until the sides before take 20000 lines, counting a side colored from its hunks alone by its lines shown up to the 5000 it colors, as each whole text is read in full and tokenized up to its last line shown', () => {
    assert.deepStrictEqual(requestsAfter(4999), [
      'old:a.ts',
      'new:a.ts',
      'old:b.ts',
      'new:b.ts',
    ]);
    assert.deepStrictEqual(requestsAfter(5000), [
      'old:a.ts',
      'new:a.ts',
      'old:b.ts',
    ]);
    assert.deepStrictEqual(requestsAfter(20_000), requestsAfter(5000));
  });
});

const codeLines = (count: number) =>
  Array.from({ length: count }, () => 'let a = 1;\n').join('');

function coloredCode(
  language: string,
  code: string,
  later: (run: () => void) => void = (run) => setTimeout(run),
): Promise<{
  readonly lines: SyntaxRange[][] | undefined;
  readonly parts: readonly CodePart[];
}> {
  return new Promise((resolve) => {
    const parts: CodePart[] = [];
    colorCode(
      language,
      code,
      (part) => {
        if (part === undefined) {
          resolve({ lines: undefined, parts });
          return;
        }
        parts.push(part);
        if (part.done) {
          resolve({ lines: parts.flatMap(partLines), parts });
        }
      },
      later,
    );
  });
}

suite('Code in documents', () => {
  test('colors a code block by its language, named or aliased, and nothing in an unknown one', async () => {
    const { lines } = await coloredCode('TS', 'const a = 1;\n// done');
    assert.deepStrictEqual(lines?.[0]?.[0], {
      start: 0,
      end: 5,
      kind: 'keyword',
    });
    assert.deepStrictEqual(lines?.[1], [{ start: 0, end: 7, kind: 'comment' }]);
    assert.strictEqual(
      (await coloredCode('no-such-language', 'a')).lines,
      undefined,
    );
  });

  test('colors code of any length a slice of time at a time, so other jobs go on between, sending its lines in parts as they are done, each part going on from the one before and the last done', async () => {
    let slices = 0;
    const { lines, parts } = await coloredCode('ts', codeLines(6000), (run) => {
      slices += 1;
      setTimeout(run);
    });

    assert.strictEqual(lines?.length, 6001);
    assert.ok(slices > 1, String(slices));
    assert.deepStrictEqual(
      parts.map((part) => part.from),
      parts.map((_, index) =>
        parts
          .slice(0, index)
          .reduce((count, part) => count + part.ends.length, 0),
      ),
    );
    assert.deepStrictEqual(
      parts.map((part) => part.done),
      parts.map((_, index) => index === parts.length - 1),
    );
  });

  test('sends the lines of its first slice of code at once, and those after at most once a frame', async () => {
    await loadLanguages(['typescript']);
    const parts: CodePart[] = [];
    const slices: (() => void)[] = [];
    const started = performance.now();
    colorCode(
      'ts',
      Array<string>(6000).fill('let sentAtOnce = 1;').join('\n'),
      (part) => {
        if (part !== undefined) {
          parts.push(part);
        }
      },
      (slice) => slices.push(slice),
    );
    await waitFor(() => slices.length > 0, 'the first slice');
    onTickingClock(started, () => {
      slices.shift()?.();
      slices.shift()?.();
    });
    assert.deepStrictEqual(
      parts.map(({ from, done }) => ({ from, done })),
      [{ from: 0, done: false }],
    );
  });

  test('colors a line of a code block of 20000 characters, but not one over 20000, as VS Code does, as minified lines take long to tokenize', async () => {
    const { lines } = await coloredCode(
      'ts',
      `a =${' '.repeat(19995)}1;\na =${' '.repeat(19996)}1;`,
    );
    assert.deepStrictEqual(lines?.[0], [
      { start: 2, end: 3, kind: 'keyword' },
      { start: 19998, end: 19999, kind: 'number' },
      { start: 19999, end: 20000, kind: 'keyword' },
    ]);
    assert.deepStrictEqual(lines[1], []);
  });

  test('keeps the colors of a code block, so a preview shown again colors none of its blocks again, sending them in one part at once', async () => {
    const code = 'const kept = 1;';
    let slices = 0;
    const later = (run: () => void) => {
      slices += 1;
      setTimeout(run);
    };
    const first = await coloredCode('ts', code, later);
    const tokenized = slices;
    const again = await coloredCode('typescript', code, later);

    assert.ok(tokenized > 0);
    assert.strictEqual(slices, tokenized);
    assert.deepStrictEqual(again.lines, first.lines);
    assert.strictEqual(again.parts.length, 1);
  });

  test('cuts a code block into the parts each color covers, keeping its lines', () => {
    assert.deepStrictEqual(
      codeSegments('let a = 1\nb', [
        [
          { start: 0, end: 3, kind: 'keyword' },
          { start: 8, end: 9, kind: 'number' },
        ],
        [],
      ]),
      [
        { text: 'let', kind: 'keyword' },
        { text: ' a = ' },
        { text: '1', kind: 'number' },
        { text: '\n' },
        { text: 'b' },
      ],
    );
  });
});

const entireOf = (messages: readonly FromSyntax[]) =>
  messages.flatMap((message) =>
    message.type === 'entire'
      ? [[message.job, message.source, partLines(message.part)]]
      : [],
  );

function served() {
  const posted: FromSyntax[] = [];
  const slices: (() => void)[] = [];
  const serve = serveColoring(
    (message) => posted.push(message),
    (slice) => slices.push(slice),
  );
  const run = () => {
    while (slices.length > 0) {
      slices.shift()?.();
    }
  };
  return { posted, serve, run };
}

suite('Coloring away from the page', () => {
  test('sends the colors of a job by the keys the page gave its lines, and nothing more once it is stopped', async () => {
    const highlighter = await loadLanguages(['typescript']);
    const sent = {
      language: 'typescript',
      lines: ['let sent = 1;', 'sent;'],
      keys: ['0:0', undefined],
    };
    const { posted, serve, run } = served();
    serve({ type: 'color', job: 1, sources: [sent] });
    serve({
      type: 'color',
      job: 2,
      sources: [
        { language: 'typescript', lines: ['let stopped = 2;'], keys: ['1:0'] },
      ],
    });
    serve({ type: 'stop', job: 2 });
    run();
    assert.deepStrictEqual(
      posted.map((message) =>
        message.type === 'colors' ? [message.job, message.ranges] : message,
      ),
      [[1, [...syntaxRanges(highlighter, [sent])]]],
    );
  });

  test('sends the colors of every line of a text asked for entire once it is colored, those without a key too, and at once for one colored before, so the page keeps them', async () => {
    const highlighter = await loadLanguages(['typescript']);
    const lines = ['/* entire', 'unkeyed */', 'let entire = 1;'];
    const source = {
      language: 'typescript',
      lines,
      keys: [undefined, undefined, '0:2'],
      entire: true as const,
    };
    const alone = syntaxRanges(highlighter, [
      {
        language: 'typescript',
        lines: [...lines, ''],
        keys: [...sideKeys(0, lines), undefined],
      },
    ]);
    const everyLine = sideKeys(0, lines).map((key) => alone.get(key));
    const { posted, serve, run } = served();
    serve({
      type: 'color',
      job: 5,
      sources: [
        { language: 'typescript', lines: ['let partly = 1;'], keys: ['1:0'] },
        source,
      ],
    });
    run();
    assert.deepStrictEqual(entireOf(posted), [[5, 1, everyLine]]);
    posted.length = 0;
    serve({ type: 'color', job: 6, sources: [source] });
    assert.deepStrictEqual(entireOf(posted), [[6, 0, everyLine]]);
  });

  test('colors a code block by its language, and nothing in one it does not know', async () => {
    const { posted, serve, run } = served();
    serve({ type: 'code', job: 3, language: 'TS', code: 'const a = 1;' });
    serve({ type: 'code', job: 4, language: 'no-such-language', code: 'a' });
    await waitFor(() => {
      run();
      return posted.length === 2;
    }, 'the code blocks');
    const lines = new Map(
      posted.flatMap((message) =>
        message.type === 'code'
          ? [
              [
                message.job,
                message.part === undefined
                  ? undefined
                  : partLines(message.part),
              ] as const,
            ]
          : [],
      ),
    );
    assert.deepStrictEqual(lines.get(3)?.[0]?.[0], {
      start: 0,
      end: 5,
      kind: 'keyword',
    });
    assert.ok(lines.has(4));
    assert.strictEqual(lines.get(4), undefined);
  });

  test('hands each job of the page the colors of its own lines, and a code block its own, dropping a job stopped', async () => {
    await loadLanguages(['typescript']);
    const slices: (() => void)[] = [];
    let received: ((message: FromSyntax) => void) | undefined;
    const port: SyntaxPort = {
      post: (message: ToSyntax) => serve(message),
      listen: (listener) => {
        received = listener;
      },
    };
    const serve = serveColoring(
      (message) => received?.(message),
      (slice) => slices.push(slice),
    );
    const colorer = colorerOf(port);
    const kept: string[] = [];
    const dropped: string[] = [];
    colorer.color(
      [{ language: 'typescript', lines: ['let kept = 3;'], keys: ['0:0'] }],
      (ranges) => kept.push(...ranges.map(([key]) => key)),
    );
    const stop = colorer.color(
      [{ language: 'typescript', lines: ['let dropped = 4;'], keys: ['1:0'] }],
      (ranges) => dropped.push(...ranges.map(([key]) => key)),
    );
    stop();
    while (slices.length > 0) {
      slices.shift()?.();
    }
    assert.deepStrictEqual([kept, dropped], [['0:0'], []]);
    const code = colorer.code('ts', 'let a;');
    await waitFor(() => slices.length > 0, 'the code to be sliced');
    while (slices.length > 0) {
      slices.shift()?.();
    }
    assert.deepStrictEqual((await code)?.[0]?.[0], {
      start: 0,
      end: 3,
      kind: 'keyword',
    });
  });

  test('hands the page the colors of code in parts as they are done, and none once it asked to stop', async () => {
    await loadLanguages(['typescript']);
    let received: ((message: FromSyntax) => void) | undefined;
    const colorer = colorerOf({
      post: (message: ToSyntax) => serve(message),
      listen: (listener) => {
        received = listener;
      },
    });
    const serve = serveColoring((message) => received?.(message));
    const parts: CodePart[] = [];
    colorer.colorParts('ts', codeLines(3000), (part) => {
      if (part !== undefined) {
        parts.push(part);
      }
    });
    const stopped: (CodePart | undefined)[] = [];
    const stop = colorer.colorParts('ts', 'let a = 1;', (part) =>
      stopped.push(part),
    );
    stop();
    await waitFor(() => parts.at(-1)?.done === true, 'the last part');
    assert.strictEqual(
      parts.reduce((count, part) => count + part.ends.length, 0),
      3001,
    );
    assert.deepStrictEqual(stopped, []);
  });

  test('drops a code block stopped before it is colored, telling the page nothing of it, as a preview left would keep the worker from the diffs', async () => {
    const posted: FromSyntax[] = [];
    let received: ((message: FromSyntax) => void) | undefined;
    const serve = serveColoring((message) => {
      posted.push(message);
      received?.(message);
    });
    const colorer = colorerOf({
      post: (message: ToSyntax) => serve(message),
      listen: (listener) => {
        received = listener;
      },
    });
    const stopping = new AbortController();
    const dropped = colorer.code('ts', 'let dropped = 5;', stopping.signal);
    stopping.abort();
    assert.strictEqual(await dropped, undefined);
    assert.ok(await colorer.code('ts', 'let kept = 6;'));
    assert.deepStrictEqual(
      posted.map((message) => message.type === 'code' && message.job),
      [2],
    );
  });

  test('reports on the page what failed away from it', () => {
    let received: ((message: FromSyntax) => void) | undefined;
    colorerOf({
      post: () => undefined,
      listen: (listener) => {
        received = listener;
      },
    });
    const reported: unknown[] = [];
    const had: unknown = Reflect.get(globalThis, 'reportError');
    Reflect.set(globalThis, 'reportError', (error: unknown) =>
      reported.push(error),
    );
    try {
      received?.({ type: 'failed', message: 'grammar failed to load' });
    } finally {
      Reflect.set(globalThis, 'reportError', had);
    }
    assert.deepStrictEqual(
      reported.map((error) => (error instanceof Error ? error.message : error)),
      ['grammar failed to load'],
    );
  });

  test('sends the page an error left uncaught in the worker, with its stack, taking it as handled so the browser does not report it on the page again', () => {
    const posted: FromSyntax[] = [];
    const error = new Error('grammar failed');
    const uncaught = Object.assign(new Event('error', { cancelable: true }), {
      error,
      message: 'Uncaught Error: grammar failed',
    });
    sendUncaught((message) => posted.push(message))(uncaught);
    assert.ok(uncaught.defaultPrevented);
    assert.deepStrictEqual(posted, [{ type: 'failed', message: error.stack }]);
  });

  test('reports a failure the worker could not send, such as one as it loads, once, taking it as handled so the browser does not report it again', () => {
    const worker = Object.assign(new EventTarget(), {
      postMessage: () => undefined,
    });
    const failures: unknown[] = [];
    workerPort(worker).listen(
      () => undefined,
      (error) => failures.push(error),
    );
    const uncaught = Object.assign(new Event('error', { cancelable: true }), {
      error: null,
      message: 'Uncaught Error: grammar failed',
    });
    assert.strictEqual(worker.dispatchEvent(uncaught), false);
    assert.deepStrictEqual(
      failures.map((error) => (error instanceof Error ? error.message : error)),
      ['Uncaught Error: grammar failed'],
    );
  });
});

suite('Making the highlighter', () => {
  test('makes it once, but again after it failed to be made, as one failed instantiation would leave every later diff uncolored', async () => {
    let made = 0;
    const highlighter = onceMade(() => {
      made++;
      return made === 1
        ? Promise.reject(new Error('out of memory'))
        : Promise.resolve(made);
    });
    await assert.rejects(highlighter(), /out of memory/);
    assert.strictEqual(await highlighter(), 2);
    assert.strictEqual(await highlighter(), 2);
    assert.strictEqual(made, 2);
  });
});
