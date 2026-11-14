import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { languageOf } from '../../../../../tools/git/page/syntax';
import {
  codeSegments,
  colorerOf,
  workerPort,
  type SyntaxPort,
} from '../../../../../lib/page/syntax';
import {
  colorCode,
  loadLanguages,
  sendUncaught,
  serveColoring,
  type FromSyntax,
  type SyntaxRange,
  type ToSyntax,
} from '../../../../../lib/page/syntaxEngine';
import { onceMade } from '../../../../../lib/page/onceMade';
import { partLines, type CodePart } from '../../../../../lib/page/syntaxParts';
import { policyOfPage, waitFor } from '../../../../helpers/fixtures';
import {
  syntaxRanges,
  sideKeys,
  onTickingClock,
  colored,
  warmsUpTheGrammar,
} from './syntaxFixtures';

suite('Syntax', () => {
  warmsUpTheGrammar();

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

  test('leaves the keys of YAML plain, as those of JSON, coloring their values', async () => {
    const lines = await colored([], {
      path: 'settings.yaml',
      binary: false,
      content: 'name: Fastforward\nscripts:\n  build: esbuild app\n',
    });
    const tokens = Object.values(lines).flat();
    assert.deepStrictEqual(
      tokens.filter((token) =>
        ['name', 'scripts', 'build'].includes(
          token.split(' ').slice(1).join(' '),
        ),
      ),
      [],
    );
    assert.ok(tokens.includes('string Fastforward'), JSON.stringify(lines));
    assert.ok(tokens.includes('string esbuild app'), JSON.stringify(lines));
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

  test('colors a job asked for in the background only while no job in the foreground has a slice left, so a diff read ahead never slows the one shown', async () => {
    await loadLanguages(['typescript']);
    const { posted, serve, run } = served();
    serve({
      type: 'color',
      job: 7,
      background: true,
      sources: [
        { language: 'typescript', lines: ['let behind = 1;'], keys: ['0:0'] },
      ],
    });
    serve({
      type: 'color',
      job: 8,
      sources: [
        { language: 'typescript', lines: ['let ahead = 2;'], keys: ['1:0'] },
      ],
    });
    run();
    assert.deepStrictEqual(
      posted.flatMap((message) =>
        message.type === 'colors' ? [message.job] : [],
      ),
      [8, 7],
    );
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
