import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { strings } from '../../../../shared/strings';
import { parsePatch } from '../../../../tools/git/page/diff';
import { collapseThreshold } from '../../../../tools/git/shared/protocol';
import type { TextWidths } from '../../../../ui/textWidths';
import { patch } from './diffViewFixtures';
import {
  diffRowKey,
  diffRows,
  lineKeys,
  type DiffRow,
} from '../../../../tools/git/page/diffRows';
import {
  diffRowPlace,
  rowHeight,
  rowMeasures,
  knownBreaks,
  rememberBreaks,
  BreakMarks,
  WrapMarks,
  anchoredScrollTop,
  rowAnchors,
  scrollAnchor,
  widestColumns,
} from '../../../../tools/git/page/diffView';

const wideColumnsIn = (row: string) => (index: number) =>
  row.slice(0, index).length + row.slice(0, index).split('界').length - 1;

const narrowColumnsIn = (row: string) => (index: number) =>
  Math.min(index, row.length);

const otherFontColumnsIn = (row: string) => (index: number) =>
  Math.min(index, row.length);

const contextLine = (text: string) => ({
  line: { kind: 'context' as const, oldNumber: 1, newNumber: 1, text },
  index: 0,
});

function sized(...sizes: number[]) {
  let start = 0;
  return sizes.map((size) => {
    const row = { start, size };
    start += size;
    return row;
  });
}

function wrapMarkAt(top: string, column: number): string {
  return `top:${top};left:calc(112px + var(--diff-code-padding) + ${column} * var(--diff-advance))`;
}

function wrapMarksOf(html: string): string[][] {
  return Array.from(
    html.matchAll(/class="(wrap-[a-z]+)" style="([^"]*)">([^<]*)</g),
    ([, kind, style, glyph]) => [kind, style, glyph],
  );
}

const wholeRows = (...texts: readonly string[]): DiffRow[] =>
  texts.map((text, index) => ({
    kind: 'wholeLine',
    file: 0,
    number: index + 1,
    text,
  }));

suite('Diff row heights', () => {
  test('places a row where it starts, telling its stripes how far down it is', () => {
    assert.deepStrictEqual(diffRowPlace(40, 17), {
      height: 17,
      top: 40,
      '--diff-row-top': '40px',
    });
  });

  test('gives every row but the error, a large file and placeholders the same fixed height, that of a row of the other columns, so the columns line up', () => {
    const rows = diffRows(
      parsePatch(
        [
          'diff --git a/a.png b/a.png',
          'Binary files a/a.png and b/a.png differ',
          patch('a.ts', 1),
          '@@ -10,0 +11,1 @@',
          '+line',
        ].join('\n'),
      ),
      new Map(),
      undefined,
    );
    assert.deepStrictEqual(
      rows.map((row) => [row.kind, rowHeight(row)]),
      [
        ['error', undefined],
        ['file', 22],
        ['binary', 22],
        ['file', 22],
        ['line', 22],
        ['hunk', 22],
        ['line', 22],
      ],
    );
    const split = diffRows(
      parsePatch(patch('a.ts', 1)),
      new Map(),
      undefined,
      false,
      true,
    );
    assert.deepStrictEqual(
      split.map((row) => [row.kind, rowHeight(row)]),
      [
        ['error', undefined],
        ['file', 22],
        ['split', 22],
      ],
    );
    const whole = diffRows([], new Map(), {
      path: 'a.ts',
      content: 'a\n',
      binary: false,
    });
    assert.deepStrictEqual(
      whole.map((row) => [row.kind, rowHeight(row)]),
      [
        ['error', undefined],
        ['file', 22],
        ['wholeLine', 22],
      ],
    );
    const [, , large] = diffRows(
      parsePatch(patch('graph.json', collapseThreshold + 1)),
      new Map(),
      undefined,
    );
    assert.strictEqual(large.kind, 'large');
    assert.notStrictEqual(rowHeight(large), 22);
    const loading = diffRows([], new Map(), undefined, true);
    assert.deepStrictEqual(
      loading.map((row) => rowHeight(row)),
      [undefined, undefined],
    );
  });

  test('makes the rows of code as tall as the lines of the diff, the file headers, hunk dividers and notes a line each, so every row is a whole number of lines', () => {
    const rows = diffRows(
      parsePatch(
        [
          'diff --git a/a.png b/a.png',
          'Binary files a/a.png and b/a.png differ',
          patch('a.ts', 1),
          '@@ -10,0 +11,1 @@',
          '+line',
        ].join('\n'),
      ),
      new Map(),
      undefined,
    );
    assert.deepStrictEqual(
      rows.map((row) => [row.kind, rowHeight(row, false, 17)]),
      [
        ['error', undefined],
        ['file', 17],
        ['binary', 17],
        ['file', 17],
        ['line', 17],
        ['hunk', 17],
        ['line', 17],
      ],
    );
    const split = diffRows(
      parsePatch(patch('a.ts', 1)),
      new Map(),
      undefined,
      false,
      true,
    );
    assert.deepStrictEqual(
      split.map((row) => rowHeight(row, false, 17)),
      [undefined, 17, 17],
    );
    const whole = diffRows([], new Map(), {
      path: 'a.ts',
      content: 'a\n',
      binary: false,
    });
    assert.deepStrictEqual(
      whole.map((row) => rowHeight(row, false, 17)),
      [undefined, 17, 17],
    );
    assert.deepStrictEqual(
      rows.map((_, index) =>
        rowMeasures(rows, undefined, 17).estimateSize(index),
      ),
      [204, 17, 17, 17, 17, 17, 17],
    );
  });

  test('guesses no height for the row of an error while the diff shows none, as it draws that row empty, so the first change it jumps to before measuring that row is where it guessed', () => {
    const rows = diffRows(parsePatch(patch('a.ts', 1)), new Map(), undefined);
    assert.strictEqual(
      rowMeasures(
        rows,
        undefined,
        17,
        1,
        undefined,
        undefined,
        false,
      ).estimateSize(0),
      0,
    );
    assert.strictEqual(rowMeasures(rows, undefined, 17).estimateSize(0), 204);
  });

  test('measures how far the widest line of an inline diff reaches, a tab to its next stop, to widen every row to it', () => {
    const files = parsePatch(
      [
        'diff --git a/a.ts b/a.ts',
        '--- a/a.ts',
        '+++ b/a.ts',
        '@@ -1,2 +1,2 @@',
        ' short',
        '-abcdefghi\tx',
        '+longer line',
      ].join('\n'),
    );
    assert.strictEqual(
      widestColumns(diffRows(files, new Map(), undefined)),
      13,
    );
    assert.strictEqual(
      widestColumns(
        diffRows([], new Map(), {
          path: 'a.ts',
          content: 'a\nbbb\n',
          binary: false,
        }),
      ),
      3,
    );
  });

  test('measures the widest line of an inline diff by how wide its characters are drawn, as a line of wide characters reached past its count of them and the view jumped once it left the drawn rows', () => {
    const files = parsePatch(
      [
        'diff --git a/a.ts b/a.ts',
        '--- a/a.ts',
        '+++ b/a.ts',
        '@@ -1 +1 @@',
        '-abcd',
        '+中中中',
      ].join('\n'),
    );
    const wide: TextWidths = {
      char: 8,
      of: (cluster) => (cluster === '中' ? 16 : 8),
    };
    assert.strictEqual(
      widestColumns(diffRows(files, new Map(), undefined), wide),
      6,
    );
  });

  test("keys a row by its kind too, so a row of fixed height doesn't take the measured height of a placeholder that was in its place", () => {
    const loading = diffRows([], new Map(), undefined, true);
    const loaded = diffRows(parsePatch(patch('a.ts', 1)), new Map(), undefined);
    assert.strictEqual(rowHeight(loading[1]), undefined);
    assert.notStrictEqual(rowHeight(loaded[1]), undefined);
    assert.notStrictEqual(diffRowKey(loading[1], 1), diffRowKey(loaded[1], 1));
  });

  test('keeps the same size and key callbacks while the rows are the same, so the virtualizer measures only from the first changed row', () => {
    const rows = diffRows(parsePatch(patch('a.ts', 2)), new Map(), undefined);
    const same = diffRows(parsePatch(patch('a.ts', 2)), new Map(), undefined);
    const measures = rowMeasures(rows);
    assert.strictEqual(rowMeasures(rows), measures);
    assert.notStrictEqual(rowMeasures(same).getItemKey, measures.getItemKey);
    assert.deepStrictEqual(
      rows.map((_, index) => [
        measures.estimateSize(index),
        measures.getItemKey(index),
      ]),
      [
        [220, '0:error'],
        [22, '1:file'],
        [22, '2:line'],
        [22, '3:line'],
      ],
    );
    const loading = diffRows([], new Map(), undefined, true);
    assert.deepStrictEqual(
      loading.map((_, index) => rowMeasures(loading).estimateSize(index)),
      [220, 242],
    );
  });

  test('measures a row to whole device pixels and whole lines, so rows of lines a fraction of a CSS pixel tall follow one another without gaps, and every row starts on a line', () => {
    const rows = diffRows(parsePatch(patch('a.ts', 2)), new Map(), undefined);
    const measure = (height: number, ratio: number) =>
      rowMeasures(rows, { left: 80, right: 80 }, 16.8, ratio).measureElement(
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        {} as Element,
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        {
          borderBoxSize: [{ blockSize: height }],
        } as unknown as ResizeObserverEntry,
      );
    assert.strictEqual(measure(67.2, 1.25), 67.2);
    assert.strictEqual(measure(67.21, 1.25), 67.2);
    assert.strictEqual(measure(51.4, 1.5), 4 * 16.8);
    assert.notStrictEqual(
      rowMeasures(rows, undefined, 17, 1.25),
      rowMeasures(rows, undefined, 17, 1.5),
    );
  });

  const wrapping = parsePatch(
    [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1,2 +1,2 @@',
      ' one',
      '-one two three',
      '+one two three four five',
    ].join('\n'),
  );

  test('measures the rows of code while wrapping, keeping the height of the others fixed', () => {
    const rows = diffRows(wrapping, new Map(), undefined);
    assert.deepStrictEqual(
      rows.map((row) => [row.kind, rowHeight(row, true)]),
      [
        ['error', undefined],
        ['file', 22],
        ['line', undefined],
        ['line', undefined],
        ['line', undefined],
      ],
    );
    const split = diffRows(wrapping, new Map(), undefined, false, true);
    assert.deepStrictEqual(
      split.map((row) => rowHeight(row, true)),
      [undefined, 22, undefined, undefined],
    );
    const whole = diffRows([], new Map(), {
      path: 'a.ts',
      content: 'one\n',
      binary: false,
    });
    assert.deepStrictEqual(
      whole.map((row) => rowHeight(row, true)),
      [undefined, 22, undefined],
    );
  });

  test('estimates a row of code by the rows its text wraps to, a side by side row by its taller side', () => {
    const rows = diffRows(wrapping, new Map(), undefined);
    const measures = rowMeasures(rows, { left: 7, right: 7 });
    assert.deepStrictEqual(
      rows.map((_, index) => measures.estimateSize(index)),
      [220, 22, 22, 44, 88],
    );
    const split = diffRows(wrapping, new Map(), undefined, false, true);
    const sides = rowMeasures(split, { left: 13, right: 7 });
    assert.deepStrictEqual(
      split.map((_, index) => sides.estimateSize(index)),
      [220, 22, 22, 88],
    );
    const taller = rowMeasures(rows, { left: 7, right: 7 }, 17);
    assert.deepStrictEqual(
      rows.map((_, index) => taller.estimateSize(index)),
      [204, 17, 17, 34, 68],
    );
  });

  test('estimates a row of code by how wide its characters are drawn once measured, as the browser wraps a line of Chinese or emoji by their widths', () => {
    const rows = diffRows(
      parsePatch(
        [
          'diff --git a/a.md b/a.md',
          '--- a/a.md',
          '+++ b/a.md',
          '@@ -0,0 +1 @@',
          '+中文中文中文',
        ].join('\n'),
      ),
      new Map(),
      undefined,
    );
    const wide = {
      char: 10,
      of: (cluster: string) => (/[中文]/.test(cluster) ? 20 : 10),
    };
    const line = rows.findIndex((row) => row.kind === 'line');
    assert.strictEqual(
      rowMeasures(rows, { left: 7, right: 7 }).estimateSize(line),
      22,
    );
    assert.strictEqual(
      rowMeasures(rows, { left: 7, right: 7 }, 22, 1, wide).estimateSize(line),
      44,
    );
  });

  test('estimates a row of code over a thousand rows from those in view by the columns its text spans, finding where it wraps only for the rows nearer, a row that fits on one line as one either way, keeping each estimate until the rows are measured anew, as finding where every line of a large file wraps on each step of a resize took a quarter of a second', () => {
    const wraps = 'one two three four five six';
    const rows = wholeRows(
      wraps,
      ...Array.from({ length: 2998 }, () => 'fits'),
      wraps,
      'fits\r',
      '\t\t\tab',
      '中文中文',
    );
    const near = { current: 0 };
    const measures = rowMeasures(
      rows,
      { left: 7, right: 7 },
      22,
      1,
      undefined,
      near,
    );
    assert.strictEqual(measures.estimateSize(0), 110);
    assert.strictEqual(measures.estimateSize(2999), 88);
    assert.strictEqual(measures.estimateSize(2998), 22);
    assert.strictEqual(measures.estimateSize(3000), 22);
    assert.strictEqual(measures.estimateSize(3001), 44);
    assert.strictEqual(measures.estimateSize(3002), 22);
    near.current = 2990;
    assert.strictEqual(measures.estimateSize(2999), 88);
    assert.strictEqual(measures.estimateSize(0), 110);
    assert.strictEqual(
      rowMeasures(rows, { left: 7, right: 7 }, 22, 1, undefined, near),
      measures,
    );
    const anew = rowMeasures(
      rows,
      { left: 7, right: 7 },
      17,
      1,
      undefined,
      near,
    );
    assert.strictEqual(anew.estimateSize(2999), 85);
    assert.strictEqual(anew.estimateSize(0), 68);
  });

  test('counts the columns the text of a row spans once for the rows and the widths their characters are drawn, rather than on every step of a resize', () => {
    let measured = 0;
    const widths = {
      char: 10,
      of: () => {
        measured++;
        return 10;
      },
    };
    const rows = wholeRows(
      ...Array.from({ length: 2999 }, () => 'fits'),
      'é one two three four five',
    );
    const near = { current: 0 };
    rowMeasures(rows, { left: 7, right: 7 }, 22, 1, widths, near).estimateSize(
      2999,
    );
    const once = measured;
    for (const columns of [8, 9, 10]) {
      rowMeasures(
        rows,
        { left: columns, right: columns },
        22,
        1,
        widths,
        near,
      ).estimateSize(2999);
    }
    assert.ok(once > 0);
    assert.strictEqual(measured, once);
  });

  test('groups the marks of a line of more than 64 rows into blocks of 64 rows, each drawn only once near the rows in sight, as drawing the marks of every row of a line of thousands of rows made scrolling over it slow', () => {
    const html = renderToStaticMarkup(
      <BreakMarks
        breaks={Array.from({ length: 100 }, () => ({ end: 6, blanks: [] }))}
        numbers={2}
        lineHeight={17}
      />,
    );

    assert.strictEqual(
      html,
      [
        `<span class="wrap-block" style="top:0;height:${64 * 17}px"></span>`,
        `<span class="wrap-block" style="top:${64 * 17}px;height:${36 * 17}px"></span>`,
      ].join(''),
    );
    assert.doesNotMatch(
      renderToStaticMarkup(
        <BreakMarks
          breaks={Array.from({ length: 64 }, () => ({ end: 6, blanks: [] }))}
          numbers={2}
          lineHeight={17}
        />,
      ),
      /wrap-block/,
    );
  });

  test('marks where each row a line is broken into ends, right after its text, the tabs hanging there, and each run of spaces hanging there once, as wide as its spaces, a whole advance of the text per column, leaving lines on one row unmarked', () => {
    const html = renderToStaticMarkup(
      <BreakMarks
        breaks={[
          {
            end: 6,
            blanks: [
              { column: 3, tab: false },
              { column: 4, tab: false },
              { column: 5, tab: false },
            ],
          },
          { end: 4, blanks: [{ column: 3, tab: true }] },
        ]}
        numbers={2}
        lineHeight={17}
      />,
    );
    assert.deepStrictEqual(wrapMarksOf(html), [
      [
        'wrap-spaces',
        `${wrapMarkAt('0', 3)};width:calc(3 * var(--diff-advance))`,
        '',
      ],
      ['wrap-break', wrapMarkAt('0', 6), strings.symbols.breaks],
      ['wrap-blank', wrapMarkAt('17px', 3), strings.symbols.tab],
      ['wrap-break', wrapMarkAt('17px', 4), strings.symbols.breaks],
    ]);
    assert.deepStrictEqual(
      wrapMarksOf(
        renderToStaticMarkup(
          <BreakMarks
            breaks={[{ end: 6, blanks: [] }]}
            numbers={1}
            lineHeight={22}
          />,
        ),
      ),
      [
        [
          'wrap-break',
          'top:0;left:calc(56px + var(--diff-code-padding) + 6 * var(--diff-advance))',
          strings.symbols.breaks,
        ],
      ],
    );
    assert.strictEqual(
      renderToStaticMarkup(
        <BreakMarks breaks={[]} numbers={2} lineHeight={22} />,
      ),
      '',
    );
    assert.strictEqual(
      renderToStaticMarkup(
        <WrapMarks
          text="one two three"
          columns={undefined}
          numbers={2}
          lineHeight={22}
        />,
      ),
      '',
    );
  });

  test('draws no marks on a wrapped line until the browser has laid it out, as they follow its breaks rather than the estimate', () => {
    assert.strictEqual(
      renderToStaticMarkup(
        <WrapMarks
          text="one two three"
          columns={7}
          numbers={2}
          lineHeight={22}
        />,
      ),
      '<span class="wrap-marks" aria-hidden="true"></span>',
    );
  });

  test('knows a line that fits in the columns it wraps at has no breaks without laying it out, as laying out every line scrolled into view made dragging the scrollbar slow', () => {
    assert.deepStrictEqual(knownBreaks('fits', 8, 22, wideColumnsIn), []);
    assert.strictEqual(
      knownBreaks('it may wrap', 8, 22, wideColumnsIn),
      undefined,
    );
    assert.strictEqual(
      knownBreaks('界界界界', 8, 22, wideColumnsIn),
      undefined,
    );
    assert.strictEqual(knownBreaks('fits', 8, 22, undefined), undefined);
  });

  test('lays out a line that may wrap only once for its text, the columns it wraps at, its line height and font, so a line scrolled back into view is not laid out again', () => {
    const columnsIn = narrowColumnsIn;
    const otherFont = otherFontColumnsIn;
    const text = 'a line long enough to wrap, remembered';
    const breaks = [{ end: 9, blanks: [] }];

    rememberBreaks(text, 10, 22, columnsIn, breaks);

    assert.strictEqual(knownBreaks(text, 10, 22, columnsIn), breaks);
    assert.strictEqual(knownBreaks(text, 11, 22, columnsIn), undefined);
    assert.strictEqual(knownBreaks(text, 10, 23, columnsIn), undefined);
    assert.strictEqual(knownBreaks(text, 10, 22, otherFont), undefined);
  });

  test('gives a wrapped row of plain text narrower than its columns the height of one line rather than measuring it, as measuring every row scrolled into view made dragging the scrollbar of a large diff slow, and its estimate is one line too', () => {
    const line = contextLine;
    const split = (left: string, right: string): DiffRow => ({
      kind: 'split',
      file: 0,
      left: line(left),
      right: line(right),
    });
    const columns = { left: 10, right: 12 };

    assert.strictEqual(
      rowHeight(split('fits', 'fits too'), true, 22, columns),
      22,
    );
    assert.strictEqual(
      rowHeight(
        { kind: 'split', file: 0, left: undefined, right: line('fits') },
        true,
        22,
        columns,
      ),
      22,
    );
    for (const row of [
      split('far too long here', 'fits'),
      split('fits', 'eleven char'.repeat(2)),
      split('tab	here', 'fits'),
      split('café', 'fits'),
      split('0123456789', 'fits'),
    ]) {
      assert.strictEqual(rowHeight(row, true, 22, columns), undefined);
    }
    assert.strictEqual(rowHeight(split('fits', 'fits'), true, 22), undefined);
    assert.strictEqual(
      rowHeight(
        { kind: 'wholeLine', file: 0, number: 1, text: 'fits' },
        true,
        22,
        columns,
      ),
      22,
    );
  });

  test('gives a wrapped row of plain text ending in a carriage return, as every line of a file with Windows line ends does, the height of one line too, as the carriage return hangs at the end of its row rather than wrapping', () => {
    const columns = { left: 10, right: 10 };
    for (const text of ['fits\r', '012345678\r']) {
      assert.strictEqual(
        rowHeight(
          { kind: 'wholeLine', file: 0, number: 1, text },
          true,
          22,
          columns,
        ),
        22,
      );
    }
    for (const text of ['0123456789\r', 'tab\there\r', 'café\r', 'a\rb']) {
      assert.strictEqual(
        rowHeight(
          { kind: 'wholeLine', file: 0, number: 1, text },
          true,
          22,
          columns,
        ),
        undefined,
      );
    }
  });

  test('keys the rows of code again when the rows or the width they wrap in change, so they are measured again, but no other row', () => {
    const rows = diffRows(wrapping, new Map(), undefined);
    const same = diffRows(wrapping, new Map(), undefined);
    const narrow = rowMeasures(rows, { left: 7, right: 7 });
    const wide = rowMeasures(rows, { left: 8, right: 8 });
    const other = rowMeasures(same, { left: 7, right: 7 });
    assert.strictEqual(rowMeasures(rows, { left: 8, right: 8 }), wide);
    for (const measures of [wide, other, rowMeasures(rows)]) {
      assert.notStrictEqual(measures.getItemKey(2), narrow.getItemKey(2));
      assert.strictEqual(measures.getItemKey(1), narrow.getItemKey(1));
    }
  });

  test('measures the rows again when their lines change height, as the virtualizer keeps its sizes until the key callback changes', () => {
    const rows = diffRows(wrapping, new Map(), undefined);
    const unwrapped = rowMeasures(rows);
    assert.strictEqual(rowMeasures(rows, undefined, 22), unwrapped);
    assert.notStrictEqual(
      rowMeasures(rows, undefined, 17).getItemKey,
      unwrapped.getItemKey,
    );
    const wrapped = rowMeasures(rows, { left: 7, right: 7 });
    const taller = rowMeasures(rows, { left: 7, right: 7 }, 17);
    assert.strictEqual(rowMeasures(rows, { left: 7, right: 7 }, 17), taller);
    assert.notStrictEqual(taller.getItemKey(2), wrapped.getItemKey(2));
  });
});

suite('Scroll anchoring', () => {
  test('finds what the row at the top of the view shows, and how far into it the view starts', () => {
    const rows = sized(22, 22, 22);
    const shown = [['a'], ['b', 'c'], ['d']];
    assert.deepStrictEqual(scrollAnchor(rows, shown, 0), {
      shows: ['a'],
      fraction: 0,
    });
    assert.deepStrictEqual(scrollAnchor(rows, shown, 33), {
      shows: ['b', 'c'],
      fraction: 0.5,
    });
    assert.deepStrictEqual(scrollAnchor(rows, shown, 66), {
      shows: ['d'],
      fraction: 1,
    });
    assert.strictEqual(scrollAnchor([], [], 0), undefined);
  });

  test('scrolls back to the first row showing what was at the top once the rows change, as far into it as before', () => {
    const rows = sized(66, 44, 22);
    const shown = [['a'], ['b'], ['c']];
    assert.strictEqual(
      anchoredScrollTop({ shows: ['b', 'c'], fraction: 0.5 }, rows, shown),
      88,
    );
    assert.strictEqual(
      anchoredScrollTop({ shows: ['a'], fraction: 0 }, rows, shown),
      0,
    );
    assert.strictEqual(
      anchoredScrollTop({ shows: ['x'], fraction: 0 }, rows, shown),
      undefined,
    );
  });

  test('keeps a pixel of the row that was at the top in view, as a row scrolled nearly past it would leave the next one there once it shrinks', () => {
    const rows = sized(22, 22, 22);
    const shown = [['a'], ['b'], ['c']];
    assert.strictEqual(
      anchoredScrollTop({ shows: ['b'], fraction: 219.6 / 220 }, rows, shown),
      22 + 21,
    );
    assert.strictEqual(
      anchoredScrollTop({ shows: ['b'], fraction: 1 }, rows, shown),
      22 + 21,
    );
  });

  test('names a line alike inline and side by side, and the headers and hunk gaps by their file and order', () => {
    const files = parsePatch(
      [
        patch('a.ts', 1),
        '@@ -10,1 +11,1 @@',
        '-one two three',
        '+one two three four five',
      ].join('\n'),
    );
    const inlineRows = diffRows(files, new Map(), undefined);
    const splitRows = diffRows(files, new Map(), undefined, false, true);
    const inline = rowAnchors(inlineRows, lineKeys(inlineRows));
    const split = rowAnchors(splitRows, lineKeys(splitRows));
    assert.deepStrictEqual(inline, [
      ['error'],
      ['0:file'],
      ['0:0'],
      ['0:hunk:1'],
      ['0:1'],
      ['0:2'],
    ]);
    assert.deepStrictEqual(split, [
      ['error'],
      ['0:file'],
      ['0:0'],
      ['0:hunk:1'],
      ['0:1', '0:2'],
    ]);
    const added = scrollAnchor(sized(22, 22, 22, 22, 22, 22), inline, 115.5);
    assert.ok(added);
    assert.strictEqual(
      anchoredScrollTop(added, sized(22, 22, 22, 22, 44), split),
      88 + 0.25 * 44,
    );
  });
});
