import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { SkeletonRows } from '../../webview/skeleton';
import { tagsWith } from '../fixtures';

suite('Placeholders', () => {
  test('draws grey bars in rows of the given kind', () => {
    const html = renderToStaticMarkup(
      <SkeletonRows count={3} className="diff-line" />,
    );
    assert.strictEqual(tagsWith(html, 'diff-line', 'skeleton-row').length, 3);
    assert.match(html, /aria-busy="true"/);
  });
});
