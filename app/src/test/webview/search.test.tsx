import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { Column } from '../../webview/column';
import { SearchButton } from '../../webview/search';
import { noop, tagWith } from '../fixtures';

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

  test('puts the search of a column at the far right of its header, after its other buttons, and lays what it opens over the whole column', () => {
    const document = page(
      renderToStaticMarkup(
        <Column
          title="Files"
          actions={<button className="other" />}
          search={<SearchButton title="Search files" onClick={noop} />}
          overlay={<div className="opened" />}
        >
          <div className="body" />
        </Column>,
      ),
    );
    const actions = document.querySelector('.column-title .column-actions');
    assert.deepStrictEqual(
      Array.from(actions?.children ?? [], (child) => child.className),
      ['other', 'nav-button search-button'],
    );
    assert.strictEqual(
      document.querySelector('.opened')?.parentElement,
      document.querySelector('section.column'),
    );
  });

  test('gives a header with only a search the place for it', () => {
    const document = page(
      renderToStaticMarkup(
        <Column search={<SearchButton title="Search" onClick={noop} />}>
          <div />
        </Column>,
      ),
    );
    assert.ok(document.querySelector('.column-actions .search-button'));
  });
});
