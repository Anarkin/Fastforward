import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { strings } from '../../../../../lib/shared/strings';
import { BreakMarks, WrapMarks } from '../../../../../tools/git/page/wrapMarks';

function wrapMarkAt(top: string, column: number): string {
  return `top:${top};left:calc(112px + var(--diff-code-padding) + ${column} * var(--diff-advance))`;
}

function wrapMarksOf(html: string): string[][] {
  return Array.from(
    html.matchAll(/class="(wrap-[a-z]+)" style="([^"]*)">([^<]*)</g),
    ([, kind, style, glyph]) => [kind, style, glyph],
  );
}

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
});
