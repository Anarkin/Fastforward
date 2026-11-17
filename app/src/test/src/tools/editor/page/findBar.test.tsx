import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { EditorFindBar } from '../../../../../tools/editor/page/findBar';
import type { EditorFinding } from '../../../../../tools/editor/page/finding';
import type { FindQuery } from '../../../../../tools/editor/page/find';
import { plainSearch } from '../../../../../lib/shared/searchOptions';
import { noop } from '../../../../helpers/fixtures';
import { clicked, mounted, typed } from '../../../../helpers/mounted';

function finder(query: FindQuery, asked: FindQuery[]): EditorFinding {
  return {
    finding: true,
    setFinding: noop,
    replacing: false,
    setReplacing: noop,
    query,
    setQuery: (next) => {
      if (typeof next !== 'function') {
        asked.push(next);
      }
    },
    replacement: '',
    setReplacement: noop,
    findInput: { current: null },
  };
}

suite('The find bar of the editor', () => {
  test('draws the search bar with the query, its options, the current match of all and the steps, and asks for the query and the options changed', async () => {
    const asked: FindQuery[] = [];
    const query = {
      text: 'let',
      options: { ...plainSearch, wholeWord: true },
    };
    await mounted(
      <EditorFindBar
        view={{ current: undefined }}
        finder={finder(query, asked)}
        findCount={{ current: 2, matches: 7, capped: false, invalid: false }}
      >
        {null}
      </EditorFindBar>,
      (main) => {
        const bar = main.querySelector('.column-title.searching > .search-bar');
        assert.ok(bar?.classList.contains('monospace'), 'the font of the code');
        assert.ok(bar);
        assert.strictEqual(bar.querySelector('input')?.value, 'let');
        assert.strictEqual(
          bar.querySelector('.search-count')?.textContent,
          '2 of 7',
        );
        assert.deepStrictEqual(
          Array.from(bar.querySelectorAll('.search-toggle'), (toggle) =>
            toggle.getAttribute('aria-pressed'),
          ),
          ['false', 'true', 'false'],
        );
        assert.deepStrictEqual(
          Array.from(bar.querySelectorAll('.search-steps button'), (button) =>
            button.hasAttribute('disabled'),
          ),
          [false, false],
        );
        clicked(bar.querySelectorAll('.search-toggle')[0]);
        typed(bar.querySelector('input'), 'const');
      },
    );
    assert.deepStrictEqual(asked, [
      {
        text: 'let',
        options: { caseSensitive: true, wholeWord: true, regex: false },
      },
      { text: 'const', options: { ...plainSearch, wholeWord: true } },
    ]);
  });
});
