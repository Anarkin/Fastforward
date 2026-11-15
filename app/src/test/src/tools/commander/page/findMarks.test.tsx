import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { MarkedText } from '../../../../../tools/commander/page/findMarks';

suite('Matches marked in a file viewed', () => {
  test('draws the spaces and tabs of a row as the diff does once whitespace is shown, in its pieces and marks alike, and leaves them plain otherwise', () => {
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
    assert.ok(
      shown.includes(
        '<mark class="find-match"><span class="spaces"> </span></mark>',
      ),
      shown,
    );
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
      'a<span class="spaces">   </span>b',
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
