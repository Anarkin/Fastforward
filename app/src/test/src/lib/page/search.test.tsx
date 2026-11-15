import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { isValidElement } from 'react';
import { BackIcon } from '../../../../lib/page/icons';
import {
  FindActions,
  FindField,
  SearchButton,
  SearchRow,
} from '../../../../lib/page/search';
import { gitKeymap } from '../../../../tools/git/page/keymap';
import { strings } from '../../../../lib/shared/strings';
import { matchCount } from '../../../../lib/shared/textMatches';
import { keyPress, noop, tagWith } from '../../../helpers/fixtures';

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

suite('Find in diff', () => {
  test('steps with Enter and Shift+Enter, and closes on Esc', () => {
    const steps: number[] = [];
    const queries: string[] = [];
    let closed = 0;
    const field = (query: string) => {
      const element = FindField({
        query,
        count: matchCount(query, 3, 0),
        countTitle: strings.find.unsearched(2),
        keys: gitKeymap,
        onQuery: (next) => queries.push(next),
        onStep: (step) => steps.push(step),
        onClose: () => closed++,
      });
      assert.ok(
        isValidElement<{
          children: [
            React.ReactElement<{
              onKeyDown: (
                event: ReturnType<typeof keyPress> & {
                  preventDefault: () => void;
                },
              ) => void;
            }>,
            React.ReactNode,
          ];
        }>(element),
      );
      return element;
    };
    const press = (query: string, key: string, shiftKey = false) =>
      field(query).props.children[0].props.onKeyDown({
        ...keyPress(key, { shiftKey }),
        preventDefault: noop,
      });
    press('x', 'Enter');
    press('x', 'Enter', true);
    assert.strictEqual(closed, 0);
    press('x', 'Escape');
    assert.deepStrictEqual(steps, [1, -1]);
    assert.deepStrictEqual(queries, []);
    assert.strictEqual(closed, 1);
    const html = renderToStaticMarkup(field('x'));
    assert.match(html, /placeholder="Search…"/);
    assert.match(
      html,
      /<span class="find-field-count" title="Large files not shown yet are not searched: 2">1 of 3<\/span>/,
    );
    assert.doesNotMatch(renderToStaticMarkup(field('')), /find-field-count/);
  });

  test('steps only while there are matches', () => {
    const steps: number[] = [];
    const actions = (matches: number) => {
      const element = FindActions({
        matches,
        onStep: (step) => steps.push(step),
      });
      assert.ok(
        isValidElement<{
          children: React.ReactElement<{
            title: string;
            disabled?: boolean;
            onClick: () => void;
          }>[];
        }>(element),
      );
      return element.props.children;
    };
    for (const button of actions(2)) {
      assert.ok(!button.props.disabled, button.props.title);
      button.props.onClick();
    }
    assert.deepStrictEqual(steps, [-1, 1]);
    assert.deepStrictEqual(
      actions(0).map((button) => [button.props.title, !!button.props.disabled]),
      [
        ['Previous Match', true],
        ['Next Match', true],
      ],
    );
  });
});
