import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { strings } from '../../../../shared/strings';
import {
  Code,
  codeProps,
  gapWidth,
  wordPadding,
  marked,
  rowOverscan,
  sameRowInput,
  selectionSide,
  wholeChangeClass,
  type DiffRow,
} from '../../../../tools/git/page/diffView';
import type { LineWords } from '../../../../tools/git/page/wordDiff';
import { countingReads } from '../../../fixtures';

function sign(glyph: string, text: string): string {
  return `<span class="blank" data-glyph="${glyph}">${text}</span>`;
}

function spaces(run: string): string {
  return `<span class="spaces">${run}</span>`;
}

function wrapMarkup(
  text: string,
  indent: number | undefined,
  syntax: Parameters<typeof marked>[1] = [],
  whitespace = false,
): string {
  return renderToStaticMarkup(
    <>
      {marked(
        text,
        syntax,
        [],
        'word-added',
        [],
        undefined,
        whitespace,
        indent,
      )}
    </>,
  );
}

function layoutSteps(padding: number, scale: number): number[] {
  const exact = padding * scale * 64;
  return [Math.floor(exact), Math.round(exact)];
}

suite('Drawing code', () => {
  test('draws only one row beyond those in view while the diff is dragged by its scrollbar, enough for it to snap to whole lines, as a drag jumps past more, and drawing them made every step of it slow, but the wheel and keys scroll into them', () => {
    assert.strictEqual(rowOverscan(true), 1);
    assert.ok(rowOverscan(false) > 0);
  });

  test('draws a row anew only once the row or what it is drawn from changed, not on every scroll of the diff, as drawing every row shown on every step of a drag made dragging the scrollbar of a large diff slow', () => {
    const row: DiffRow = { kind: 'hunk', file: 0 };
    const words = new Map();
    const drawn = (inputs: readonly unknown[], index = 3, shown = row) => ({
      row: shown,
      index,
      inputs,
      render: () => null,
    });

    assert.ok(sameRowInput(drawn([words, 17]), drawn([words, 17])));
    assert.ok(!sameRowInput(drawn([words, 17]), drawn([new Map(), 17])));
    assert.ok(!sameRowInput(drawn([words, 17]), drawn([words, 18])));
    assert.ok(!sameRowInput(drawn([words, 17]), drawn([words, 17], 4)));
    assert.ok(
      !sameRowInput(drawn([words, 17]), drawn([words, 17], 3, { ...row })),
    );
  });

  test('pads changed words up to the top and down to the bottom of their line, apart as the text sits off center at scales like 125%, and not before the text is measured', () => {
    const line = { top: 154, bottom: 176 };
    const even = wordPadding(line, { top: 157, bottom: 173 }, 1);
    assert.deepStrictEqual(layoutSteps(even.top, 1), [192, 192]);
    assert.deepStrictEqual(layoutSteps(even.bottom, 1), [192, 192]);
    const off = wordPadding(
      line,
      { top: 154 + 2.4000091552734375, bottom: 176 - 3.5999908447265625 },
      1.25,
    );
    assert.deepStrictEqual(layoutSteps(off.top, 1.25), [192, 192]);
    assert.deepStrictEqual(layoutSteps(off.bottom, 1.25), [288, 288]);
    assert.deepStrictEqual(wordPadding(line, { top: 0, bottom: 0 }, 1), {
      top: 0,
      bottom: 0,
    });
    const over = wordPadding(line, { top: 150, bottom: 180 }, 1);
    assert.deepStrictEqual(
      [layoutSteps(over.top, 1), layoutSteps(over.bottom, 1)],
      [
        [0, 0],
        [0, 0],
      ],
    );
  });

  test('gives a line the same inputs to draw it from while its colors, changed words and matches stay, so it is not drawn again', () => {
    const keyword = [{ start: 0, end: 3, kind: 'keyword' as const }];
    const changed = [{ start: 4, end: 7 }];
    const match = { file: 0, line: 1, start: 4, end: 5 };
    const matched = [match];
    const marks = () => ({
      syntax: new Map([['0:1', keyword]]),
      words: new Map([['0:1', changed]]),
      finds: new Map([['0:1', matched]]),
      foundKey: '0:1',
      found: match,
      whitespace: false,
    });
    const before = codeProps(marks(), '0:1', 'let sum', 'removed');
    const after = codeProps(marks(), '0:1', 'let sum', 'removed');
    assert.deepStrictEqual(
      Object.entries(after).map(([name, value]) => [name, value]),
      Object.entries(before),
    );
    assert.ok(
      Object.values(after).every(
        (value, index) => Object.values(before)[index] === value,
      ),
    );
    assert.strictEqual(before.wordClass, 'word-removed');
    assert.strictEqual(before.current, match);
    const plain = codeProps(marks(), '0:2', 'x', 'added');
    const again = codeProps(marks(), undefined, 'x', undefined);
    assert.deepStrictEqual(plain.syntax, []);
    assert.strictEqual(again.syntax, plain.syntax);
    assert.strictEqual(again.words, plain.words);
    assert.strictEqual(again.finds, plain.finds);
    assert.strictEqual(plain.current, undefined);
    assert.strictEqual(plain.wordClass, 'word-added');
  });

  test('tints the row of a line changed through instead of marking its words', () => {
    const words = new Map<string, LineWords>([
      ['0:1', 'whole'],
      ['0:2', [{ start: 0, end: 1 }]],
    ]);
    const marks = {
      syntax: new Map(),
      words,
      finds: new Map(),
      foundKey: undefined,
      found: undefined,
      whitespace: false,
    };
    assert.deepStrictEqual(codeProps(marks, '0:1', 'x', 'added').words, []);
    assert.deepStrictEqual(codeProps(marks, '0:2', 'x', 'added').words, [
      { start: 0, end: 1 },
    ]);
    assert.strictEqual(wholeChangeClass(words, '0:1'), 'whole-change');
    assert.strictEqual(wholeChangeClass(words, '0:2'), '');
    assert.strictEqual(wholeChangeClass(words, undefined), '');
  });

  test('tells which side of the side-by-side diff a selection starts on, and none outside the sides', () => {
    const { document } = new JSDOM(
      '<div class="split-line"><div class="split-side"><span class="split-code"><span class="code">old</span></span></div><div class="split-side"><span class="split-code"><span class="code">new</span></span></div></div><div class="file-header">a.txt</div>',
    ).window;
    const [left, right] = document.querySelectorAll('.code');
    assert.strictEqual(selectionSide(left), 'left');
    assert.strictEqual(selectionSide(right), 'right');
    assert.strictEqual(
      selectionSide(document.querySelector('.file-header')),
      undefined,
    );
    assert.strictEqual(selectionSide(null), undefined);
  });

  test('shows a carriage return, a non-breaking space and the spaces that draw nothing as signs of their own when asked, as a change to line endings or to a pasted space looked like none, but not the joiners inside emoji', () => {
    assert.strictEqual(
      renderToStaticMarkup(
        <>
          {marked('﻿a b​c　d👍🏽‍\r', [], [], 'word-added', [], undefined, true)}
        </>,
      ),
      [
        sign(strings.symbols.invisible, '﻿'),
        'a',
        sign(strings.symbols.nonBreakingSpace, ' '),
        'b',
        sign(strings.symbols.invisible, '​'),
        'c',
        sign(strings.symbols.invisible, '　'),
        'd👍🏽‍',
        sign(strings.symbols.carriageReturn, '\r'),
      ].join(''),
    );
  });

  test('shows each run of spaces as one span dotted at each space and each tab as a sign over it when asked, inside the colors and matches, keeping the text as it is, as a sign over every space of a padded table slowed scrolling down', () => {
    const space = spaces(' ');
    const tab = `<span class="blank" data-glyph="${strings.symbols.tab}">\t</span>`;
    assert.strictEqual(
      renderToStaticMarkup(
        <>{marked('a b\tc', [], [], 'word-added', [], undefined, true)}</>,
      ),
      `a${space}b${tab}c`,
    );
    assert.strictEqual(
      renderToStaticMarkup(
        <>{marked('a   b  \t c', [], [], 'word-added', [], undefined, true)}</>,
      ),
      `a${spaces('   ')}b${spaces('  ')}${tab}${space}c`,
    );
    assert.strictEqual(
      renderToStaticMarkup(
        <>
          {marked(
            'let  x',
            [{ start: 0, end: 4, kind: 'keyword' }],
            [],
            'word-added',
            [{ start: 4, end: 6 }],
            undefined,
            true,
          )}
        </>,
      ),
      `<span class="syntax-keyword">let${space}</span><mark class="find-match ">${space}x</mark>`,
    );
    assert.strictEqual(
      renderToStaticMarkup(
        <>{marked('a b', [], [], 'word-added', [], undefined, false)}</>,
      ),
      'a b',
    );
    const marks = {
      syntax: new Map(),
      words: new Map(),
      finds: new Map(),
      foundKey: undefined,
      found: undefined,
    };
    assert.strictEqual(
      codeProps({ ...marks, whitespace: true }, '0:1', 'x', 'added').whitespace,
      true,
    );
    assert.strictEqual(
      codeProps({ ...marks, whitespace: false }, '0:1', 'x', 'added')
        .whitespace,
      false,
    );
  });

  test('puts each character drawn wider or narrower than its columns in a box exactly as wide as them, as our terminal draws them on its grid, a blank shown in one too, giving the widths only to a line with a character beyond ASCII, so measuring the font draws no other line again', () => {
    const boxing = {
      char: 10,
      of: () => 20,
      boxed: (cluster: string) => (/[😀中　]/u.test(cluster) ? 2 : undefined),
    };
    const drawn = (text: string, whitespace: boolean) =>
      renderToStaticMarkup(
        <>
          {marked(
            text,
            [],
            [],
            'word-added',
            [],
            undefined,
            whitespace,
            undefined,
            boxing,
          )}
        </>,
      );
    assert.strictEqual(
      drawn('a😀b中c', false),
      'a<span class="cell wide">😀</span>b<span class="cell wide">中</span>c',
    );
    assert.strictEqual(
      drawn('a　b', true),
      `a<span class="blank cell wide" data-glyph="${strings.symbols.invisible}">　</span>b`,
    );
    const widthsOf = (line: string) =>
      codeProps(
        {
          syntax: new Map(),
          words: new Map(),
          finds: new Map(),
          foundKey: undefined,
          found: undefined,
          whitespace: false,
          widths: boxing,
        },
        '0:1',
        line,
        'added',
      ).widths;
    assert.strictEqual(widthsOf('x 😀'), boxing);
    assert.strictEqual(widthsOf('x'), undefined);
  });

  test('leaves the breaking of a line longer than 64 KiB to the browser, as marking every place such a line may break draws a node for each, a minified file drawing a hundred thousand in one row', () => {
    const long = 'a.b(c) '.repeat(10_000);
    assert.ok(long.length > 64 * 1024);
    assert.doesNotMatch(wrapMarkup(long, 0), /<wbr/);
    assert.match(wrapMarkup('a.b(c) d.e(f)', 0), /<wbr/);
  });

  test('keeps the indentation of a wrapped line longer than 64 KiB on the row with its code, as the app expects, as the browser broke such a line right after its indentation', () => {
    const indented = `    ${'a.b(c) '.repeat(10_000)}`;
    const markup = wrapMarkup(indented, 4);
    assert.ok(markup.startsWith('<span class="lead">    </span>a.b(c) '));
    assert.doesNotMatch(markup, /<wbr/);
  });

  test('lets a wrapped line break where VS Code would, inside its colors too, keeping its indentation on the row with the code it indents', () => {
    assert.strictEqual(
      wrapMarkup('    a.b(c)', 4),
      '<span class="lead">    </span>a.<wbr/>b<wbr/>(c)',
    );
    assert.strictEqual(
      wrapMarkup('a.b(c)', 0, [{ start: 0, end: 2, kind: 'keyword' }]),
      '<span class="syntax-keyword">a.</span><wbr/>b<wbr/>(c)',
    );
    assert.strictEqual(
      wrapMarkup('a.b(c)', 0, [{ start: 2, end: 3, kind: 'function' }]),
      'a.<span class="syntax-function"><wbr/>b</span><wbr/>(c)',
    );
    assert.strictEqual(
      wrapMarkup('  a', 2, [], true),
      '<span class="lead"><span class="spaces">  </span></span>a',
    );
    assert.strictEqual(wrapMarkup('  a\tb.c', 0), '  a\tb.<wbr/>c');
    assert.strictEqual(wrapMarkup('    a.b(c)', undefined), '    a.b(c)');
  });

  test('indents the rows a wrapped line wraps onto by its indentation, in characters as the code spaces them', () => {
    const props = {
      text: '  a',
      syntax: [],
      words: [],
      wordClass: 'word-added',
      finds: [],
      current: undefined,
      whitespace: false,
    };
    assert.strictEqual(
      renderToStaticMarkup(<Code {...props} indent={2} />),
      '<span class="code" style="--wrap-indent:calc(2 * var(--diff-advance))"><span class="lead">  </span>a</span>',
    );
    assert.strictEqual(
      renderToStaticMarkup(<Code {...props} indent={0} />),
      '<span class="code">  a</span>',
    );
    assert.strictEqual(
      renderToStaticMarkup(<Code {...props} />),
      '<span class="code">  a</span>',
    );
  });

  test('draws the changed words inside the line, with search matches over them', () => {
    const html = renderToStaticMarkup(
      <>
        {marked(
          'let sum = 1',
          [],
          [{ start: 4, end: 7 }],
          'word-added',
          [{ start: 5, end: 9 }],
          { start: 5, end: 9 },
        )}
      </>,
    );
    assert.strictEqual(
      html,
      'let <span class="word-added">s</span><span class="word-added"><mark class="find-match current">um</mark></span><mark class="find-match current"> =</mark> 1',
    );
  });

  test('draws a place words were inserted on the other line as a bar of no width between the characters, at the end too', () => {
    const html = renderToStaticMarkup(
      <>
        {marked(
          'abc',
          [{ start: 0, end: 2, kind: 'keyword' }],
          [
            { start: 1, end: 1 },
            { start: 3, end: 3 },
          ],
          'word-removed',
          [],
          undefined,
        )}
      </>,
    );
    assert.strictEqual(
      html,
      '<span class="syntax-keyword">a</span><span class="word-gap word-removed"></span><span class="syntax-keyword">b</span>c<span class="word-gap word-removed"></span>',
    );
  });

  test('makes the bar where words were inserted 2 pixels wide, a whole number of screen pixels at any scale so it stays sharp', () => {
    for (const [scale, pixels] of [
      [1, 2],
      [1.25, 3],
      [1.5, 3],
      [1.75, 4],
      [2, 4],
    ]) {
      assert.deepStrictEqual(layoutSteps(gapWidth(scale), scale), [
        pixels * 64,
        pixels * 64,
      ]);
    }
  });

  test('marks a line dense with colors, changed words and matches piece by piece in one pass', () => {
    const pairs = 2000;
    const text = 'ab'.repeat(pairs);
    const every = (offset: number) =>
      Array.from({ length: pairs }, (_, pair) => ({
        start: 2 * pair + offset,
        end: 2 * pair + offset + 1,
      }));
    const colors = every(0).map((range) => ({
      ...range,
      kind: 'keyword' as const,
    }));
    const syntax = countingReads(colors);
    const words = countingReads(every(1));
    const matches = countingReads(every(1));
    const drawn = marked(
      text,
      syntax.counted,
      words.counted,
      'word-added',
      matches.counted,
      undefined,
    );
    for (const { reads } of [syntax, words, matches]) {
      assert.ok(reads <= 10 * pairs, `${reads} reads of ${pairs} ranges`);
    }
    assert.ok(Array.isArray(drawn));
    assert.strictEqual(drawn.length, 2 * pairs);
    assert.strictEqual(
      renderToStaticMarkup(<>{drawn.slice(-2)}</>),
      '<span class="syntax-keyword">a</span><span class="word-added"><mark class="find-match ">b</mark></span>',
    );
  });

  test('marks the whole of a character of several code points a search match starts or ends inside, as the viewer does, as the accent left of a decomposed é or the rest of a keycap after its digit was drawn apart from it, a column further on', () => {
    assert.strictEqual(
      renderToStaticMarkup(
        <>
          {marked(
            'Café 1️⃣ é',
            [],
            [],
            'word-added',
            [
              { start: 0, end: 4 },
              { start: 6, end: 7 },
              { start: 10, end: 11 },
            ],
            { start: 0, end: 4 },
          )}
        </>,
      ),
      '<mark class="find-match current">Café</mark> ' +
        '<mark class="find-match ">1️⃣</mark> ' +
        '<mark class="find-match ">é</mark>',
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

  test('marks the matches in a line, the current one apart', () => {
    const html = renderToStaticMarkup(
      <>
        {marked(
          'find a find',
          [],
          [],
          'word-added',
          [
            { start: 0, end: 4 },
            { start: 7, end: 11 },
          ],
          { start: 7, end: 11 },
        )}
      </>,
    );
    assert.strictEqual(
      html,
      '<mark class="find-match ">find</mark> a <mark class="find-match current">find</mark>',
    );
    assert.strictEqual(
      marked('plain', [], [], 'word-added', [], undefined),
      'plain',
    );
  });
});
