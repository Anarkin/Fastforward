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
});
