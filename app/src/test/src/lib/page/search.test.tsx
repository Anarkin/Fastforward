import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { BackIcon } from '../../../../lib/page/icons';
import { SearchButton, SearchRow } from '../../../../lib/page/search';
import { noop } from '../../../helpers/fixtures';
import { tagWith } from '../../../helpers/markup';

const page = (html: string) => new JSDOM(html).window.document;

suite('Column search', () => {
  test('draws the search of a column as a button, round like the others, showing a magnifier and naming what it searches', () => {
    const html = renderToStaticMarkup(
      <SearchButton title="Search files" onClick={noop} />,
    );
    tagWith(html, 'title="Search files"', 'nav-button', 'search-button');
    const icon = page(html).querySelector('.search-button svg');
    assert.ok(icon);
    assert.ok(icon.querySelector('circle'));
    assert.ok(icon.querySelector('path'));
    assert.strictEqual(page(html).body.textContent, '');
  });

  test('opens a search with a button going back before its field, as the commit search does', () => {
    const document = page(
      renderToStaticMarkup(
        <SearchRow onClose={noop}>
          <input className="field" />
        </SearchRow>,
      ),
    );
    const row = document.querySelector('.search-row');
    assert.deepStrictEqual(
      Array.from(row?.children ?? [], (child) => child.className),
      ['nav-button', 'field'],
    );
    assert.strictEqual(row?.firstElementChild?.getAttribute('title'), 'Close');
    assert.strictEqual(
      row?.firstElementChild?.innerHTML,
      renderToStaticMarkup(<BackIcon />),
    );
  });
});
