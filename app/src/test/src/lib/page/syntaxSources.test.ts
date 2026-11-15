import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { loadLanguages } from '../../../../lib/page/syntaxLanguages';
import type { SyntaxRange } from '../../../../lib/page/syntaxEngine';
import {
  startColoring,
  tokenizing,
  uncachedSources,
} from '../../../../lib/page/syntaxSources';
import {
  syntaxRanges,
  countingLines,
  sideKeys,
  onTickingClock,
  assertNotLoaded,
  warmsUpTheGrammar,
} from './syntaxFixtures';

suite('Syntax', () => {
  warmsUpTheGrammar();

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
});
