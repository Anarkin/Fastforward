import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { Column } from '../../../../../tools/git/page/column';
import { SearchButton, SearchRow } from '../../../../../lib/page/search';
import { StatusLine } from '../../../../../tools/commander/page/statusLine';
import { noop } from '../../../../helpers/fixtures';

const page = (html: string) => new JSDOM(html).window.document;

suite('Column', () => {
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

  test('gives the whole header of a column to its open search, hiding its other buttons and its title', () => {
    const document = page(
      renderToStaticMarkup(
        <Column
          title="Files"
          start={<button className="start" />}
          actions={<button className="other" />}
          search={<SearchButton title="Search files" onClick={noop} />}
          searching={<SearchRow onClose={noop}>{null}</SearchRow>}
        >
          <div />
        </Column>,
      ),
    );
    const header = document.querySelector('.column-title');
    assert.ok(header);
    assert.ok(header.classList.contains('searching'));
    assert.deepStrictEqual(
      Array.from(header.children, (child) => child.className),
      ['search-row'],
    );
  });
});

suite('Status line', () => {
  test('goes under the body of a git column given one', () => {
    const document = page(
      renderToStaticMarkup(
        <Column title="Files" status={<StatusLine>3 files</StatusLine>}>
          <div className="body" />
        </Column>,
      ),
    );
    assert.deepStrictEqual(
      Array.from(
        document.querySelector('section.column')?.children ?? [],
        (child) => child.className,
      ),
      ['column-title', 'column-body', 'column-status'],
    );
  });
});
