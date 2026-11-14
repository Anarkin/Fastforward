import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { parsePatch } from '../../../../../tools/git/page/diff';
import {
  syntaxSources,
  textsToLoad,
} from '../../../../../tools/git/page/syntax';
import {
  loadLanguages,
  startColoring,
  tokenizing,
  uncachedSources,
  type SyntaxRange,
} from '../../../../../lib/page/syntaxEngine';
import {
  syntaxRanges,
  countingLines,
  sideKeys,
  onTickingClock,
  assertNotLoaded,
  loadedTexts,
  warmsUpTheGrammar,
} from './syntaxFixtures';

suite('Syntax', () => {
  warmsUpTheGrammar();

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

  test('keeps no colors of a text over 100000 lines, keeping those of the others, as storing it forgot every other text and then itself', async () => {
    const { counting, lines: tokenized } = countingLines(
      await loadLanguages(['typescript']),
    );
    const color = (name: string, length: number) =>
      syntaxRanges(counting, [
        {
          language: 'typescript',
          lines: [name, ...Array<string>(length - 1).fill('')],
          keys: ['0:0'],
        },
      ]);
    color('keptBeside', 50_000);
    color('overLines', 100_001);
    color('keptBeside', 50_000);
    color('overLines', 100_001);
    assert.deepStrictEqual(
      tokenized.filter((line) => line !== ''),
      ['keptBeside', 'overLines', 'overLines'],
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
