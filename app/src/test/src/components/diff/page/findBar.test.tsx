import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { DiffFindBar } from '../../../../../components/diff/page/findBar';
import type { useDiffFind } from '../../../../../components/diff/page/finding';
import {
  plainSearch,
  type SearchOptions,
} from '../../../../../lib/shared/searchOptions';
import { noop } from '../../../../helpers/fixtures';
import { clicked, mounted, typed } from '../../../../helpers/mounted';

type Find = ReturnType<typeof useDiffFind>;

function find(asked: unknown[], matches: number): Find {
  return {
    query: 'find',
    search: (query) => asked.push({ search: query }),
    choose: (options: SearchOptions) => asked.push({ choose: options }),
    options: { ...plainSearch, regex: true },
    setQuery: (query) => asked.push({ query }),
    setOptions: (options: SearchOptions) => asked.push({ options }),
    jump: 0,
    placed: false,
    input: { current: null },
    matches: Array.from({ length: matches }, (_, line) => ({
      file: 0,
      line,
      start: 0,
      end: 4,
    })),
    shown: 1,
    goTo: (index) => asked.push({ goTo: index }),
    step: (by) => asked.push({ step: by }),
    finding: true,
    openFind: noop,
    closeFind: () => asked.push('closed'),
  };
}

suite('The find of the diff', () => {
  test('draws the search bar with the query, its options and the current match of all, stepping, closing and searching for the query and the options anew from where the diff is', async () => {
    const asked: unknown[] = [];
    await mounted(
      <DiffFindBar find={find(asked, 3)} unsearched={2} />,
      (main) => {
        const bar = main.querySelector('.search-bar');
        assert.ok(bar);
        assert.ok(bar.classList.contains('monospace'), 'the font of the code');
        assert.strictEqual(bar.querySelector('input')?.value, 'find');
        const count = bar.querySelector('.search-count');
        assert.strictEqual(count?.textContent, '2 of 3');
        assert.strictEqual(
          count.getAttribute('data-tip'),
          'Large files not shown yet are not searched: 2',
        );
        assert.deepStrictEqual(
          Array.from(bar.querySelectorAll('.search-toggle'), (toggle) =>
            toggle.getAttribute('aria-pressed'),
          ),
          ['false', 'false', 'true'],
        );
        const [previous, next] = bar.querySelectorAll('.search-steps button');
        clicked(previous);
        clicked(next);
        clicked(bar.querySelectorAll('.search-toggle')[1]);
        typed(bar.querySelector('input'), 'found');
        clicked(bar.querySelector('.search-bar > .nav-button'));
      },
    );
    assert.deepStrictEqual(asked, [
      { step: -1 },
      { step: 1 },
      { choose: { caseSensitive: false, wholeWord: true, regex: true } },
      { search: 'found' },
      'closed',
    ]);
  });

  test('turns its steps off while nothing matches', async () => {
    await mounted(<DiffFindBar find={find([], 0)} unsearched={0} />, (main) => {
      assert.deepStrictEqual(
        Array.from(main.querySelectorAll('.search-steps button'), (button) =>
          button.hasAttribute('disabled'),
        ),
        [true, true],
      );
      assert.strictEqual(
        main.querySelector('.search-count')?.textContent,
        'No matches',
      );
      assert.strictEqual(
        main.querySelector('.search-count')?.hasAttribute('title'),
        false,
      );
    });
  });
});
