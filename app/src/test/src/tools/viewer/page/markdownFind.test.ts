import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { afterAll, suite, test } from 'vitest';
import {
  markdownMatches,
  openedTo,
} from '../../../../../tools/viewer/page/markdownFind';
import { plainSearch } from '../../../../../lib/shared/searchOptions';

const { window } = new JSDOM('');

const shown = (html: string, code: ReadonlyMap<string, string> = new Map()) => {
  const root = window.document.createElement('div');
  root.innerHTML = html;
  const codeOf = (element: Element) =>
    element.tagName === 'CODE'
      ? code.get(element.getAttribute('data-block') ?? '')
      : undefined;
  return { root, codeOf };
};

const textOf = (range: StaticRange) => {
  const live = window.document.createRange();
  live.setStart(range.startContainer, range.startOffset);
  live.setEnd(range.endContainer, range.endOffset);
  return live.toString();
};

const described = (matches: ReturnType<typeof markdownMatches>): string[] =>
  matches.map((match) =>
    match.kind === 'prose'
      ? `prose ${textOf(match.range)}`
      : `code ${match.code.getAttribute('data-block') ?? ''} ${String(match.line)} ${String(match.start)}-${String(match.end)}`,
  );

suite('Finding in a Markdown preview', () => {
  afterAll(() => window.close());

  test('opens the closed details a match is in once it goes to it, the outer ones too, as a browser finding in a page does, and leaves a details closed whose summary the match is in', () => {
    const { root, codeOf } = shown(
      [
        '<details><summary>beta told</summary><p>hidden beta</p>',
        '<details><summary>inner</summary><p>deeper beta</p></details>',
        '</details>',
      ].join(''),
    );
    const [inSummary, hidden, deeper] = markdownMatches(
      root,
      codeOf,
      'beta',
      plainSearch,
    );
    const [outer, inner] = root.querySelectorAll('details');
    assert.ok(inSummary && hidden && deeper && outer && inner);

    openedTo(inSummary);
    assert.strictEqual(outer.hasAttribute('open'), false);
    openedTo(deeper);
    assert.deepStrictEqual(
      [outer.hasAttribute('open'), inner.hasAttribute('open')],
      [true, true],
    );
  });

  test('finds in the text of each block as it reads, across bold, links and code inside a line, and in the lines of a block of code drawn as cells, in the order of the document, leaving out what is hidden, as the source of a diagram', () => {
    const { root, codeOf } = shown(
      [
        '<h1>Beta at the top</h1>',
        '<p>alpha <strong>be</strong>ta and <a href="#">bet</a>a, <code>beta</code></p>',
        '<pre><code data-block="one"></code></pre>',
        '<ul><li>first beta<ul><li>inner beta</li></ul>after beta</li></ul>',
        '<pre hidden><code class="language-mermaid">beta</code></pre>',
      ].join(''),
      new Map([['one', 'const beta = 1;\nlet x;\nbeta(beta);\n']]),
    );

    assert.deepStrictEqual(
      described(markdownMatches(root, codeOf, 'beta', plainSearch)),
      [
        'prose Beta',
        'prose beta',
        'prose beta',
        'prose beta',
        'code one 0 6-10',
        'code one 2 0-4',
        'code one 2 5-9',
        'prose beta',
        'prose beta',
        'prose beta',
      ],
    );
  });

  test('matches the case, whole words and regular expressions as every search of the app, and finds nothing for an empty query or a regular expression that is not valid', () => {
    const { root, codeOf } = shown('<p>Beta betas BETA</p>');
    const count = (query: string, options = plainSearch) =>
      markdownMatches(root, codeOf, query, options).length;

    assert.strictEqual(count('beta'), 3);
    assert.strictEqual(
      count('beta', { ...plainSearch, caseSensitive: true }),
      1,
    );
    assert.strictEqual(count('beta', { ...plainSearch, wholeWord: true }), 2);
    assert.strictEqual(count('b.ta$', { ...plainSearch, regex: true }), 1);
    assert.strictEqual(count('(', { ...plainSearch, regex: true }), 0);
    assert.strictEqual(count(''), 0);
  });
});
