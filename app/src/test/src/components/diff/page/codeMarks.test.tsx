import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { strings } from '../../../../../lib/shared/strings';
import { dotLook } from '../../../../../lib/page/dotLook';
import { codeProps } from '../../../../../components/diff/page/lineMarks';
import {
  Code,
  MarkedCode,
} from '../../../../../components/diff/page/codeMarks';
import { codePieces } from '../../../../../components/diff/page/codePieces';
import { wrapStarts } from '../../../../../lib/page/wordWrap';

function sign(glyph: string, text: string): string {
  return `<span class="blank" data-glyph="${glyph}">${text}</span>`;
}

function spaces(run: string): string {
  return `<span class="spaces">${run}</span>`;
}

function wrapMarkup(
  text: string,
  indent: number | undefined,
  syntax: React.ComponentProps<typeof MarkedCode>['syntax'] = [],
  whitespace = false,
): string {
  return renderToStaticMarkup(
    <>
      <MarkedCode
        text={text}
        syntax={syntax}
        words={[]}
        wordClass={'word-added'}
        found={[]}
        foundNow={undefined}
        whitespace={whitespace}
        indent={indent}
      />
    </>,
  );
}

const look = dotLook(14, 8, 1);

const dot = (column: number) =>
  `transparent 0 ${column * 8 + 3}px,currentColor 0 ${column * 8 + 5}px`;

suite('Drawing code', () => {
  test('shows a carriage return, a non-breaking space and the spaces that draw nothing as signs of their own when asked, as a change to line endings or to a pasted space looked like none, but not the joiners inside emoji', () => {
    assert.strictEqual(
      renderToStaticMarkup(
        <>
          <MarkedCode
            text={'﻿a b​c　d👍🏽‍\r'}
            syntax={[]}
            words={[]}
            wordClass={'word-added'}
            found={[]}
            foundNow={undefined}
            whitespace={true}
          />
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
        <>
          <MarkedCode
            text={'a b\tc'}
            syntax={[]}
            words={[]}
            wordClass={'word-added'}
            found={[]}
            foundNow={undefined}
            whitespace={true}
          />
        </>,
      ),
      `a${space}b${tab}c`,
    );
    assert.strictEqual(
      renderToStaticMarkup(
        <>
          <MarkedCode
            text={'a   b  \t c'}
            syntax={[]}
            words={[]}
            wordClass={'word-added'}
            found={[]}
            foundNow={undefined}
            whitespace={true}
          />
        </>,
      ),
      `a${spaces('   ')}b${spaces('  ')}${tab}${space}c`,
    );
    assert.strictEqual(
      renderToStaticMarkup(
        <>
          <MarkedCode
            text={'let  x'}
            syntax={[{ start: 0, end: 4, kind: 'keyword' }]}
            words={[]}
            wordClass={'word-added'}
            found={[{ start: 4, end: 6 }]}
            foundNow={undefined}
            whitespace={true}
          />
        </>,
      ),
      `<span class="syntax-keyword">let${space}</span><mark class="find-match ">${space}x</mark>`,
    );
    assert.strictEqual(
      renderToStaticMarkup(
        <>
          <MarkedCode
            text={'a b'}
            syntax={[]}
            words={[]}
            wordClass={'word-added'}
            found={[]}
            foundNow={undefined}
            whitespace={false}
          />
        </>,
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
          <MarkedCode
            text={text}
            syntax={[]}
            words={[]}
            wordClass={'word-added'}
            found={[]}
            foundNow={undefined}
            whitespace={whitespace}
            widths={boxing}
          />
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

  test('draws a wrapped line longer than 64 KiB in blocks of 64 rows, each starting where the app expects the browser to wrap it, only those near the rows in sight and the one of the current match, as laying out the whole of a line of a megabyte each time it scrolled into view or out of it stalled the diff for seconds', () => {
    const long = Array.from(
      { length: 12_000 },
      (_, index) => `word${index}`,
    ).join(' ');
    assert.ok(long.length > 64 * 1024);
    const starts = wrapStarts(long, 80, 0);
    const block = 3;
    const at = starts[block * 64 + 10];
    const match = { start: at, end: at + 4 };
    const html = renderToStaticMarkup(
      <Code
        text={long}
        syntax={[]}
        words={[]}
        wordClass={'word-added'}
        finds={[match]}
        current={match}
        whitespace={false}
        indent={0}
        columns={80}
        lineHeight={17}
      />,
    );

    const blocks = Array.from(
      { length: Math.ceil(starts.length / 64) },
      (_, index) =>
        `<span class="code-block" style="top:${index === 0 ? '0' : `${index * 64 * 17}px`};height:${Math.min(64, starts.length - index * 64) * 17}px"></span>`,
    );
    const from = starts[block * 64];
    const to = starts[(block + 1) * 64];
    assert.strictEqual(
      html,
      [
        `<span class="code"><span class="code-blocks" style="height:${starts.length * 17}px">`,
        ...blocks,
        `<span class="code-run" style="top:${block * 64 * 17}px;text-indent:0">`,
        long.slice(from, at),
        `<mark class="find-match current">${long.slice(at, at + 4)}</mark>`,
        long.slice(at + 4, to),
        '</span></span></span>',
      ].join(''),
    );
  });

  test('draws the spaces of a line as plain text while they are shown, dotted by one layer over the line rather than a span around each run, in a line not wrapped by a layer of its own at the columns of its spaces, in a wrapped one by its wrap marks, keeping the signs of tabs, and the spans in a line too long to mark', () => {
    const props = {
      syntax: [],
      words: [],
      wordClass: 'word-added',
      finds: [],
      current: undefined,
      whitespace: true,
      dotLook: look,
    };
    const tab = `<span class="blank" data-glyph="${strings.symbols.tab}">\t</span>`;
    assert.strictEqual(
      renderToStaticMarkup(<Code {...props} text={'a b  c\t'} />),
      `<span class="code">a b  c${tab}<span class="dot-rows" aria-hidden="true" style="left:0;background-image:linear-gradient(to right,${dot(0)},${dot(2)},${dot(3)},transparent 0);background-position:8px var(--dot-top);background-size:32px var(--space-dot)"></span></span>`,
    );
    assert.strictEqual(
      renderToStaticMarkup(<Code {...props} text="ab" />),
      '<span class="code">ab</span>',
    );
    assert.match(
      renderToStaticMarkup(
        <Code {...props} text="a b  c d" dotColumns={[2, 4]} />,
      ),
      /background-image:linear-gradient\(to right,transparent 0 3px,currentColor 0 5px,transparent 0\);background-position:24px var\(--dot-top\);/,
    );
    assert.strictEqual(
      renderToStaticMarkup(
        <Code {...props} text="a b" indent={0} columns={10} lineHeight={17} />,
      ),
      '<span class="code">a b</span>',
    );
    assert.match(
      renderToStaticMarkup(
        <Code {...props} text={`a b${'x'.repeat(64 * 1024)}`} />,
      ),
      /^<span class="code">a<span class="spaces"> <\/span>bx/,
    );
    assert.strictEqual(
      renderToStaticMarkup(<Code {...props} whitespace={false} text="a b" />),
      '<span class="code">a b</span>',
    );
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
        <MarkedCode
          text={'let sum = 1'}
          syntax={[]}
          words={[{ start: 4, end: 7 }]}
          wordClass={'word-added'}
          found={[{ start: 5, end: 9 }]}
          foundNow={{ start: 5, end: 9 }}
        />
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
        <MarkedCode
          text={'abc'}
          syntax={[{ start: 0, end: 2, kind: 'keyword' }]}
          words={[
            { start: 1, end: 1 },
            { start: 3, end: 3 },
          ]}
          wordClass={'word-removed'}
          found={[]}
          foundNow={undefined}
        />
      </>,
    );
    assert.strictEqual(
      html,
      '<span class="syntax-keyword">a</span><span class="word-gap word-removed"></span><span class="syntax-keyword">b</span>c<span class="word-gap word-removed"></span>',
    );
  });

  test('marks the whole of a character of several code points a search match starts or ends inside, as the viewer does, as the accent left of a decomposed é or the rest of a keycap after its digit was drawn apart from it, a column further on', () => {
    assert.strictEqual(
      renderToStaticMarkup(
        <>
          <MarkedCode
            text={'Café 1️⃣ é'}
            syntax={[]}
            words={[]}
            wordClass={'word-added'}
            found={[
              { start: 0, end: 4 },
              { start: 6, end: 7 },
              { start: 10, end: 11 },
            ]}
            foundNow={{ start: 0, end: 4 }}
          />
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
          <MarkedCode
            text={'let sum = 1'}
            syntax={[
              { start: 0, end: 3, kind: 'keyword' },
              { start: 10, end: 11, kind: 'number' },
            ]}
            words={[{ start: 0, end: 7 }]}
            wordClass={'word-added'}
            found={[{ start: 2, end: 5 }]}
            foundNow={undefined}
          />
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
        <MarkedCode
          text={'find a find'}
          syntax={[]}
          words={[]}
          wordClass={'word-added'}
          found={[
            { start: 0, end: 4 },
            { start: 7, end: 11 },
          ]}
          foundNow={{ start: 7, end: 11 }}
        />
      </>,
    );
    assert.strictEqual(
      html,
      '<mark class="find-match ">find</mark> a <mark class="find-match current">find</mark>',
    );
    assert.strictEqual(
      codePieces('plain', [], [], [], undefined).pieces,
      undefined,
    );
    assert.strictEqual(
      renderToStaticMarkup(
        <MarkedCode
          text={'plain'}
          syntax={[]}
          words={[]}
          wordClass={'word-added'}
          found={[]}
          foundNow={undefined}
        />,
      ),
      'plain',
    );
  });
});
