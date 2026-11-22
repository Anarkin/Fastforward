import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { MarkedText } from '../../../../../tools/viewer/page/findMarks';

suite('Matches marked in a file viewed', () => {
  test('marks an occurrence of the text selected apart from a match of the find, so it is drawn as what the editor marks on its own', () => {
    assert.strictEqual(
      renderToStaticMarkup(
        <MarkedText
          pieces={[{ text: 'ab c' }]}
          marks={[{ start: 0, end: 2, current: false, occurrence: true }]}
        />,
      ),
      '<mark class="occurrence-match">ab</mark> c',
    );
  });

  test('draws a piece of a row as its text alone, in an element only where it has a color or a mark, as an element around every piece, a second one around each colored piece, made a screen of code 1,994 elements rather than 490', () => {
    assert.strictEqual(
      renderToStaticMarkup(
        <MarkedText
          pieces={[
            { text: 'let ' },
            { text: 'a', kind: 'plain' },
            { text: ' = ' },
            { text: '1', kind: 'number' },
            { text: ';' },
          ]}
          marks={[]}
        />,
      ),
      'let <span class="syntax-plain">a</span> = <span class="syntax-number">1</span>;',
    );
  });

  test('signs the tabs of a row as the diff does once whitespace is shown, in its pieces and marks alike, leaving its spaces plain for the layer of the row to dot, and leaves them all plain otherwise', () => {
    const tab = String.fromCharCode(9);
    const pieces = [
      { text: 'a b' },
      { text: `${tab}c`, kind: 'keyword' as const },
    ];
    const marks = [{ start: 1, end: 2, current: false }];

    assert.strictEqual(
      renderToStaticMarkup(
        <MarkedText pieces={[{ text: 'a b' }]} marks={[]} />,
      ),
      'a b',
    );
    const shown = renderToStaticMarkup(
      <MarkedText pieces={pieces} marks={marks} blanks />,
    );
    assert.ok(shown.includes('<mark class="find-match"> </mark>'), shown);
    assert.ok(
      shown.includes(
        `<span class="syntax-keyword"><span class="blank" data-glyph="→">${tab}</span>c</span>`,
      ),
      shown,
    );
    assert.strictEqual(
      renderToStaticMarkup(
        <MarkedText pieces={[{ text: 'a   b' }]} marks={[]} blanks />,
      ),
      'a   b',
    );
  });

  test('leaves the control characters of a row in its text, in its colors and marks and beside a tab signed, whether whitespace shows or not, as the diff does, for the font of the app to draw each a column wide, and swaps the form feed alone for its picture, which Chromium draws as nothing whatever font has it', () => {
    const tab = String.fromCharCode(9);
    const formFeed = String.fromCharCode(12);
    assert.strictEqual(
      renderToStaticMarkup(
        <MarkedText
          pieces={[{ text: `a\u0001b\u007f${formFeed}` }]}
          marks={[]}
        />,
      ),
      'a\u0001b\u007f␌',
    );
    assert.strictEqual(
      renderToStaticMarkup(
        <MarkedText
          pieces={[
            { text: `\u001b[0m${tab}`, kind: 'string' as const },
            { text: `x${formFeed}` },
          ]}
          marks={[{ start: 5, end: 7, current: true }]}
          blanks
        />,
      ),
      `<span class="syntax-string">\u001b[0m<span class="blank" data-glyph="→">${tab}</span></span><mark class="find-match current">x␌</mark>`,
    );
  });

  test('marks a picture of the form feed the file itself holds, boxed or not, so that copying tells it from one drawn for a form feed, and leaves the other pictures a file holds as any character', () => {
    const formFeed = String.fromCharCode(12);
    const boxing = {
      char: 10,
      of: () => 20,
      boxed: (cluster: string) => (cluster === '␌' ? 1 : undefined),
    };
    assert.strictEqual(
      renderToStaticMarkup(
        <MarkedText pieces={[{ text: `a␌␛b${formFeed}` }]} marks={[]} />,
      ),
      'a<span data-genuine="">␌</span>␛b␌',
    );
    assert.strictEqual(
      renderToStaticMarkup(
        <MarkedText
          pieces={[{ text: `a␌${formFeed}` }]}
          marks={[]}
          widths={boxing}
        />,
      ),
      'a<span class="cell" data-genuine="">␌</span>␌',
    );
  });

  test('puts no control character in a box, whatever the font of the user draws, as the font of the app draws each a column wide, where a picture swapped in for each needed a box wherever a font drew it wider or narrower, an element for each', () => {
    const boxing = {
      char: 10,
      of: () => 10,
      boxed: (cluster: string) => (/[^ -~]/.test(cluster) ? 1 : undefined),
    };
    const text = 'a\u0007b\u001b[0m\u007f';
    assert.strictEqual(
      renderToStaticMarkup(
        <MarkedText pieces={[{ text }]} marks={[]} widths={boxing} />,
      ),
      text,
    );
  });

  test('puts each character drawn wider or narrower than its columns in a box exactly as wide as them, as the diff does', () => {
    const boxing = {
      char: 10,
      of: () => 20,
      boxed: (cluster: string) => (cluster === '😀' ? 2 : undefined),
    };
    assert.strictEqual(
      renderToStaticMarkup(
        <MarkedText pieces={[{ text: 'a😀b' }]} marks={[]} widths={boxing} />,
      ),
      'a<span class="cell wide">😀</span>b',
    );
  });
});
