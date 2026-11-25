import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { Column } from '../../../../lib/page/column';
import { SearchBar } from '../../../../lib/page/searchBar';
import { plainSearch } from '../../../../lib/shared/searchOptions';
import { noop } from '../../../helpers/fixtures';

const page = (html: string) => new JSDOM(html).window.document;

suite('Column', () => {
  test('puts the search of a column at the far right of its header, after its other buttons, and lays what it opens over the whole column', () => {
    const document = page(
      renderToStaticMarkup(
        <Column
          title="Files"
          actions={<button className="other" />}
          search={<button className="nav-button search-button" />}
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
        <Column search={<button className="nav-button search-button" />}>
          <div />
        </Column>,
      ),
    );
    assert.ok(document.querySelector('.column-actions .search-button'));
  });

  test('floats the open search of a column over the top right of its body, keeping its header, its title and its buttons as they were, as the commander and the terminal float theirs', () => {
    const document = page(
      renderToStaticMarkup(
        <Column
          title="Files"
          start={<button className="start" />}
          actions={<button className="other" />}
          search={<button className="nav-button search-button" />}
          searching={
            <SearchBar
              font="proportional"
              query=""
              options={plainSearch}
              found={{ current: 0, matches: 0 }}
              onQuery={noop}
              onOptions={noop}
            />
          }
        >
          <div />
        </Column>,
      ),
    );
    const header = document.querySelector('.column-title');
    assert.deepStrictEqual(
      Array.from(header?.children ?? [], (child) => child.className),
      ['toolbar column-start', 'column-name', 'toolbar column-actions'],
    );
    const column = document.querySelector('section.column');
    assert.ok(column?.classList.contains('search-scope') === true);
    assert.ok(column);
    assert.deepStrictEqual(
      Array.from(column.children, (child) => child.className),
      ['column-title', 'column-body search-area', 'floating-search'],
    );
    assert.ok(
      document.querySelector('.floating-search > .search-bar'),
      'the search in the floating box',
    );
  });
});

suite('Status line', () => {
  test('goes under the body of a git column given one', () => {
    const document = page(
      renderToStaticMarkup(
        <Column
          title="Files"
          status={<footer className="column-status">3 files</footer>}
        >
          <div className="body" />
        </Column>,
      ),
    );
    assert.deepStrictEqual(
      Array.from(
        document.querySelector('section.column')?.children ?? [],
        (child) => child.className,
      ),
      ['column-title', 'column-body search-area', 'column-status'],
    );
  });
});
