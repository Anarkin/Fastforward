import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { ViewerFindBar } from '../../../../../tools/commander/page/viewerFindBar';
import type { ViewerSearch } from '../../../../../tools/commander/page/viewerFind';
import { plainSearch } from '../../../../../lib/shared/searchOptions';
import { noop } from '../../../../helpers/fixtures';
import { clicked, mounted, typed } from '../../../../helpers/mounted';

const searched = (asked: unknown[], matches = 9): ViewerSearch => ({
  query: 'needle',
  options: { ...plainSearch, caseSensitive: true },
  found: { current: 3, matches, searching: false },
  search: (query) => asked.push({ query }),
  choose: (options) => asked.push({ options }),
  step: (by) => asked.push({ step: by }),
});

const toggles = (main: HTMLElement) =>
  Array.from(main.querySelectorAll('.search-toggle'), (toggle) => [
    toggle.getAttribute('aria-pressed'),
    toggle.hasAttribute('disabled'),
    toggle.getAttribute('title'),
  ]);

suite('The find of the viewer', () => {
  test('draws the search bar of text and hex with the query, its options, the current match of all and the steps, asking for the query, the options and the steps', async () => {
    const asked: unknown[] = [];
    let closed = 0;
    await mounted(
      <ViewerFindBar
        searched={searched(asked)}
        inPdf={false}
        input={{ current: null }}
        onClose={() => closed++}
      />,
      (main) => {
        const bar = main.querySelector('.column-title.searching > .search-bar');
        assert.ok(bar);
        assert.ok(bar.classList.contains('monospace'), 'the font of the text');
        assert.strictEqual(bar.querySelector('input')?.value, 'needle');
        assert.strictEqual(
          bar.querySelector('.search-count')?.textContent,
          '4 of 9',
        );
        assert.deepStrictEqual(toggles(main), [
          ['true', false, 'Match Case'],
          ['false', false, 'Whole Word'],
          ['false', false, 'Use Regular Expression'],
        ]);
        clicked(bar.querySelectorAll('.search-toggle')[2]);
        const [previous, next] = bar.querySelectorAll('.search-steps button');
        clicked(next);
        clicked(previous);
        typed(bar.querySelector('input'), 'pin');
        clicked(bar.querySelector('.search-bar > .nav-button'));
      },
    );
    assert.deepStrictEqual(asked, [
      { options: { caseSensitive: true, wholeWord: false, regex: true } },
      { step: 1 },
      { step: -1 },
      { query: 'pin' },
    ]);
    assert.strictEqual(closed, 1);
  });

  test('turns the regular expression off in a PDF, which PDF.js cannot search by, saying why', async () => {
    await mounted(
      <ViewerFindBar
        searched={searched([], 0)}
        inPdf
        input={{ current: null }}
        onClose={noop}
      />,
      (main) => {
        assert.ok(
          !main.querySelector('.search-bar')?.classList.contains('monospace'),
          'the font of the app, as a PDF has fonts of its own',
        );
        assert.deepStrictEqual(toggles(main)[2], [
          'false',
          true,
          "A PDF can't be searched by a regular expression.",
        ]);
        assert.strictEqual(
          main.querySelector('.search-count')?.textContent,
          'No matches',
        );
      },
    );
  });
});
