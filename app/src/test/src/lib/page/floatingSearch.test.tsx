import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FloatingSearch } from '../../../../lib/page/floatingSearch';
import { cascaded } from '../../../helpers/cascade';
import { rendered, withClass } from '../../../helpers/markup';

suite('Floating search', () => {
  test('floats a search over the top right of the area named for it, past its scrollbar, inside the scope around both, so two searches of one page float over their own areas', () => {
    const markup = renderToStaticMarkup(
      <FloatingSearch>
        <input />
      </FloatingSearch>,
    );
    assert.strictEqual(markup, '<div class="floating-search"><input/></div>');
    const page = rendered(
      <div className="search-scope">
        <div className="search-area" />
        <FloatingSearch>
          <input />
        </FloatingSearch>
      </div>,
    );
    assert.deepStrictEqual(
      [
        cascaded(withClass(page, 'search-scope'), 'anchor-scope'),
        cascaded(withClass(page, 'search-area'), 'anchor-name'),
        cascaded(withClass(page, 'floating-search'), 'position-anchor'),
        cascaded(withClass(page, 'floating-search'), 'position'),
      ],
      ['--search-area', '--search-area', '--search-area', 'absolute'],
    );
  });
});
