import * as assert from 'node:assert';
import { createElement } from 'react';
import { suite, test } from 'vitest';
import { FileFilterField } from '../../../../../tools/git/page/filesFilterField';
import { plainSearch } from '../../../../../lib/shared/searchOptions';
import { clicked, mounted, typed } from '../../../../helpers/mounted';

suite('Files search', () => {
  test('searches as one types, goes to the files on Enter or Down, closes on Esc or by its back button, and steps and toggles by its buttons', async () => {
    const asked: unknown[] = [];
    await mounted(
      createElement(FileFilterField, {
        query: 'v',
        options: plainSearch,
        found: { current: 0, matches: 3 },
        onQuery: (next) => asked.push({ query: next }),
        onOptions: (options) => asked.push({ options }),
        onStep: (step) => asked.push({ step }),
        onLeave: () => asked.push('left'),
        onClose: () => asked.push('closed'),
      }),
      (main, window) => {
        const input = main.querySelector('input');
        assert.ok(input);
        assert.strictEqual(input.getAttribute('placeholder'), 'Search…');
        assert.strictEqual(
          main.querySelector('.search-count')?.textContent,
          '1 of 3',
        );
        typed(input, 'vi');
        for (const key of ['Enter', 'ArrowDown', 'Escape', 'a']) {
          input.dispatchEvent(
            new window.KeyboardEvent('keydown', { key, bubbles: true }),
          );
        }
        clicked(main.querySelectorAll('.search-steps button')[1]);
        clicked(main.querySelectorAll('.search-toggle')[2]);
        clicked(main.querySelector('.search-bar > .nav-button'));
      },
    );
    assert.deepStrictEqual(asked, [
      { query: 'vi' },
      'left',
      'left',
      'closed',
      { step: 1 },
      { options: { ...plainSearch, regex: true } },
      'closed',
    ]);
  });
});
