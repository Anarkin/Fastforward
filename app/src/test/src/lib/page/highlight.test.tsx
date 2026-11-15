import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { HighlightWords } from '../../../../lib/page/highlight';

suite('File filter', () => {
  test('marks what the words found in a name in the search colors, leaving the rest as it is', () => {
    assert.strictEqual(
      renderToStaticMarkup(
        <HighlightWords text="DealsView.tsx" words={['view', 'TS']} />,
      ),
      'Deals<mark class="match">View</mark>.<mark class="match">ts</mark>x',
    );
    assert.strictEqual(
      renderToStaticMarkup(<HighlightWords text="a.ts" words={[]} />),
      'a.ts',
    );
  });
});
