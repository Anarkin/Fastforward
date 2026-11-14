import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { SkeletonRows } from '../../../lib/page/skeleton';
import { tagsWith } from '../../fixtures';

const widthsOf = (html: string) =>
  [...html.matchAll(/width:([0-9.]+%)/g)].map(([, width]) => width);

suite('Placeholders', () => {
  test('draws grey bars in rows of the given kind', () => {
    const html = renderToStaticMarkup(
      <SkeletonRows count={3} className="diff-line" />,
    );
    assert.strictEqual(tagsWith(html, 'diff-line', 'skeleton-row').length, 3);
    assert.match(html, /aria-busy="true"/);
  });

  test('starts the widths of its bars further along when asked, so columns side by side differ', () => {
    const first = widthsOf(renderToStaticMarkup(<SkeletonRows count={4} />));
    const later = widthsOf(
      renderToStaticMarkup(<SkeletonRows count={4} offset={3} />),
    );
    assert.strictEqual(later.length, 4);
    assert.notDeepStrictEqual(later, first);
  });
});
