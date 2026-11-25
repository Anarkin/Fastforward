import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { SearchButton } from '../../../../../tools/git/page/searchButton';
import { noop } from '../../../../helpers/fixtures';
import { tagWith } from '../../../../helpers/markup';

const page = (html: string) => new JSDOM(html).window.document;

suite('Column search', () => {
  test('draws the search of a column as a button like the others, showing a magnifier and naming what it searches', () => {
    const html = renderToStaticMarkup(
      <SearchButton title="Search files" onClick={noop} />,
    );
    tagWith(html, 'data-tip="Search files"', 'nav-button', 'search-button');
    const icon = page(html).querySelector('.search-button svg');
    assert.ok(icon);
    assert.ok(icon.querySelector('circle'));
    assert.ok(icon.querySelector('path'));
    assert.strictEqual(page(html).body.textContent, '');
  });
});
