import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { strings } from '../../../../../lib/shared/strings';
import {
  BreakMarks,
  WrapMarks,
} from '../../../../../components/diff/page/wrapMarks';

function wrapMarkAt(top: string, column: number): string {
  return `top:${top};left:calc(112px + var(--diff-code-padding) + ${column} * var(--diff-advance))`;
}

function wrapMarksOf(html: string): string[][] {
  return Array.from(
    html.matchAll(/class="(wrap-[a-z]+)" style="([^"]*)">([^<]*)</g),
    ([, kind, style, glyph]) => [kind, style, glyph],
  );
}

const cell = (from: number, to = from + 1) =>
  `transparent 0 ${from}%,currentColor 0 ${to}%`;

const columnsIn = (row: string) => (index: number) =>
  Math.min(index, row.length);

const marks = (dotted: boolean) =>
  renderToStaticMarkup(
    <WrapMarks
      text="a b"
      columns={10}
      numbers={2}
      lineHeight={17}
      columnsIn={columnsIn}
      dotted={dotted}
    />,
  );

suite('Diff row heights', () => {
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

  test('dots the spaces of a line on one layer, a row of dots for each row it is broken into at the columns of its spaces, rather than an element for each run of spaces, as a line of prose took an element a word and scrolling over it drew them all', () => {
    const html = renderToStaticMarkup(
      <BreakMarks
        breaks={[
          { end: 6, blanks: [] },
          { end: 6, blanks: [] },
        ]}
        dots={[[1, 3], [], [0]]}
        numbers={2}
        lineHeight={17}
      />,
    );
    assert.strictEqual(
      html.slice(0, html.indexOf('</span>') + '</span>'.length),
      `<span class="dot-rows" style="left:calc(112px + var(--diff-code-padding));--dot-columns:100;background-image:linear-gradient(to right,${cell(1)},${cell(3)},transparent 0),linear-gradient(to right,${cell(0)},transparent 0);background-position:0 0%,0 100%"></span>`,
    );
    assert.strictEqual(wrapMarksOf(html).length, 2);
    assert.match(
      renderToStaticMarkup(
        <BreakMarks breaks={[]} dots={[[4]]} numbers={1} lineHeight={17} />,
      ),
      /^<span class="dot-rows" style="left:calc\(56px \+ var\(--diff-code-padding\)\);--dot-columns:100;background-image:linear-gradient\(to right,transparent 0 4%,currentColor 0 5%,transparent 0\);background-position:0 0%"/,
    );
    assert.strictEqual(
      renderToStaticMarkup(
        <BreakMarks breaks={[]} dots={[[]]} numbers={1} lineHeight={17} />,
      ),
      '',
    );
  });

  test('dots the spaces of a line of more than 64 rows block by block, each block the rows it holds, the last row too, which ends in no break', () => {
    const html = renderToStaticMarkup(
      <BreakMarks
        breaks={Array.from({ length: 128 }, () => ({ end: 6, blanks: [] }))}
        dots={Array.from({ length: 129 }, () => [1])}
        numbers={2}
        lineHeight={17}
      />,
    );
    assert.strictEqual(
      html,
      [
        `<span class="wrap-block" style="top:0;height:${64 * 17}px"></span>`,
        `<span class="wrap-block" style="top:${64 * 17}px;height:${64 * 17}px"></span>`,
        `<span class="wrap-block" style="top:${128 * 17}px;height:17px"></span>`,
      ].join(''),
    );
  });

  test('marks and dots a line that wraps at once where the app expects it to wrap, before the browser has laid it out, so a line scrolled into view is drawn once rather than again once measured', () => {
    const html = renderToStaticMarkup(
      <WrapMarks
        text="aaaa bbbb cccc dddd"
        columns={10}
        numbers={2}
        lineHeight={17}
        columnsIn={columnsIn}
        dotted
      />,
    );
    assert.deepStrictEqual(
      wrapMarksOf(html).map(([kind]) => kind),
      ['wrap-spaces', 'wrap-break'],
    );
    assert.match(html, /class="dot-rows"[^>]*background-position:0 0%,0 100%/);
  });

  test('dots the spaces of a line that fits on one row without laying it out, and of no line while whitespace is hidden', () => {
    assert.match(
      marks(true),
      /class="dot-rows"[^>]*transparent 0 1%,currentColor 0 2%/,
    );
    assert.doesNotMatch(marks(false), /dot-rows/);
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

  test('draws the marks of a wrapped line where the app expects its breaks until the browser has laid it out, and of a line it knows no columns for none, the marks following the breaks of the browser from the first frame painted, as they are checked against them before it', () => {
    assert.deepStrictEqual(
      wrapMarksOf(
        renderToStaticMarkup(
          <WrapMarks
            text="one two three"
            columns={7}
            numbers={2}
            lineHeight={22}
          />,
        ),
      ).map(([kind]) => kind),
      ['wrap-spaces', 'wrap-break'],
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
});
