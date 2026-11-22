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
      '<mark class="occurrence-match">ab</mark><span> c</span>',
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

  test('draws the control characters of a row as their pictures, in its colors and marks and beside a tab signed, whether whitespace shows or not, as the diff does', () => {
    const tab = String.fromCharCode(9);
    assert.strictEqual(
      renderToStaticMarkup(
        <MarkedText pieces={[{ text: 'a\u0001b\u007f' }]} marks={[]} />,
      ),
      'a␁b␡',
    );
    assert.strictEqual(
      renderToStaticMarkup(
        <MarkedText
          pieces={[
            { text: `\u001b[0m${tab}`, kind: 'string' as const },
            { text: 'x\u0007' },
          ]}
          marks={[{ start: 5, end: 7, current: true }]}
          blanks
        />,
      ),
      `<span><span class="syntax-string">␛[0m<span class="blank" data-glyph="→">${tab}</span></span></span><mark class="find-match current">x␇</mark>`,
    );
  });

  test('marks a picture the file itself holds, boxed or not, so that copying tells it from one drawn for a control character', () => {
    const boxing = {
      char: 10,
      of: () => 20,
      boxed: (cluster: string) => (cluster === '␇' ? 1 : undefined),
    };
    assert.strictEqual(
      renderToStaticMarkup(
        <MarkedText pieces={[{ text: 'a␛␡b\u001b' }]} marks={[]} />,
      ),
      'a<span data-genuine="">␛␡</span>b␛',
    );
    assert.strictEqual(
      renderToStaticMarkup(
        <MarkedText
          pieces={[{ text: 'a␇\u0007' }]}
          marks={[]}
          widths={boxing}
        />,
      ),
      'a<span class="cell" data-genuine="">␇</span>␇',
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
