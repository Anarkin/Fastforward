import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { BackIcon } from '../../../../lib/page/icons';
import { SearchBar } from '../../../../lib/page/searchBar';
import {
  plainSearch,
  type SearchOptions,
} from '../../../../lib/shared/searchOptions';
import { noop } from '../../../helpers/fixtures';
import { clicked, mounted } from '../../../helpers/mounted';

type Props = Parameters<typeof SearchBar>[0];

const bar = (props: Partial<Props> = {}): Props => ({
  query: 'deal',
  font: 'proportional',
  options: plainSearch,
  found: { current: 1, matches: 12 },
  onQuery: noop,
  onOptions: noop,
  onStep: noop,
  onClose: noop,
  ...props,
});

const page = (props: Partial<Props> = {}) =>
  new JSDOM(renderToStaticMarkup(<SearchBar {...bar(props)} />)).window
    .document;

const barClassOf = (font: Props['font']) =>
  page({ font }).querySelector('.search-bar')?.className;

const classesOf = (element: Element | null | undefined) =>
  Array.from(element?.children ?? [], (child) => child.className);

const disabled = (matches: number) =>
  Array.from(
    page({ found: { current: 0, matches } }).querySelectorAll(
      '.search-steps button',
    ),
    (button) => button.hasAttribute('disabled'),
  );

const named = (props: Partial<Props>) =>
  page(props)
    .querySelector('.search-box-input')
    ?.getAttribute('data-focus-name');

suite('Search bar', () => {
  test('names its box for the focus a tab keeps, find unless told another name, so the tab gives the focus back to it', () => {
    assert.strictEqual(named({}), 'find');
    assert.strictEqual(named({ focusName: 'filter' }), 'filter');
  });

  test('draws, from the left, the back button, the box with its input, the counter and the three toggles at its right end, and the previous and next buttons', () => {
    const document = page();
    const shown = document.querySelector('.search-bar');
    assert.deepStrictEqual(classesOf(shown), [
      'nav-button',
      'search-box active',
      'toolbar search-steps',
    ]);
    const back = shown?.firstElementChild;
    assert.strictEqual(back?.getAttribute('data-tip'), 'Close');
    assert.strictEqual(back?.innerHTML, renderToStaticMarkup(<BackIcon />));
    assert.deepStrictEqual(classesOf(document.querySelector('.search-box')), [
      'search-box-input',
      'search-count',
      'search-toggles',
    ]);
    const input = document.querySelector('input');
    assert.strictEqual(input?.value, 'deal');
    assert.strictEqual(input.getAttribute('placeholder'), 'Search…');
    assert.strictEqual(input.getAttribute('aria-label'), 'Search…');
    assert.deepStrictEqual(
      Array.from(document.querySelectorAll('.search-toggle'), (toggle) => [
        toggle.textContent,
        toggle.getAttribute('data-tip'),
        toggle.className,
      ]),
      [
        ['Aa', 'Match Case', 'search-toggle'],
        ['W', 'Whole Word', 'search-toggle'],
        ['.*', 'Use Regular Expression', 'search-toggle'],
      ],
    );
    assert.deepStrictEqual(
      Array.from(document.querySelectorAll('.search-steps button'), (button) =>
        button.getAttribute('data-tip'),
      ),
      ['Previous Match', 'Next Match'],
    );
  });

  test('counts the current match of all that match, says when none does or the pattern is not valid, and says nothing while nothing is asked', () => {
    const count = (props: Partial<Props>) =>
      page(props).querySelector('.search-count')?.textContent;
    assert.strictEqual(count({}), '2 of 12');
    assert.strictEqual(
      count({ found: { current: 0, matches: 0 } }),
      'No matches',
    );
    assert.strictEqual(count({ query: '' }), undefined);
    assert.strictEqual(
      count({ query: '(', options: { ...plainSearch, regex: true } }),
      'Not a valid pattern',
    );
    assert.strictEqual(
      count({ found: { current: 0, matches: 0, searching: true } }),
      'Searching…',
    );
    assert.strictEqual(
      page({ countTitle: 'Large files' })
        .querySelector('.search-count')
        ?.getAttribute('data-tip'),
      'Large files',
    );
    assert.strictEqual(
      page({ query: '' }).querySelector('.search-box')?.className,
      'search-box',
    );
  });

  test('presses each toggle that is on, and turns it on or off alone when clicked, keeping the focus in the box', async () => {
    const pressed = (options: SearchOptions) =>
      Array.from(page({ options }).querySelectorAll('.search-toggle'), (each) =>
        each.getAttribute('aria-pressed'),
      );
    assert.deepStrictEqual(pressed(plainSearch), ['false', 'false', 'false']);
    assert.deepStrictEqual(
      pressed({ caseSensitive: true, wholeWord: false, regex: true }),
      ['true', 'false', 'true'],
    );
    assert.match(
      page({ options: { ...plainSearch, wholeWord: true } }).querySelectorAll(
        '.search-toggle',
      )[1].className,
      /\bactive\b/,
    );
    const asked: SearchOptions[] = [];
    await mounted(
      <SearchBar
        {...bar({
          options: { ...plainSearch, wholeWord: true },
          onOptions: (options) => asked.push(options),
        })}
      />,
      (main, window) => {
        const toggles =
          main.querySelectorAll<HTMLButtonElement>('.search-toggle');
        for (const toggle of toggles) {
          const event = new window.MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
          });
          toggle.dispatchEvent(event);
          assert.strictEqual(event.defaultPrevented, true);
          clicked(toggle);
        }
      },
    );
    assert.deepStrictEqual(asked, [
      { caseSensitive: true, wholeWord: true, regex: false },
      { caseSensitive: false, wholeWord: false, regex: false },
      { caseSensitive: false, wholeWord: true, regex: true },
    ]);
  });

  test('turns the regular expression off where it cannot be used, saying why, and counts as it would without it', () => {
    const document = page({
      query: '(',
      options: { ...plainSearch, regex: true },
      noRegex: 'Not here',
    });
    const regex = document.querySelectorAll('.search-toggle')[2];
    assert.strictEqual(regex.hasAttribute('disabled'), true);
    assert.strictEqual(regex.getAttribute('data-tip'), 'Not here');
    assert.strictEqual(regex.getAttribute('aria-pressed'), 'false');
    assert.strictEqual(
      document.querySelector('.search-count')?.textContent,
      '2 of 12',
    );
  });

  test('steps to the previous and next match and goes back by its buttons, handing the keys typed in its box on', async () => {
    const steps: number[] = [];
    const keys: string[] = [];
    let closed = 0;
    await mounted(
      <SearchBar
        {...bar({
          onStep: (step) => steps.push(step),
          onClose: () => closed++,
          onKeyDown: (event) => keys.push(event.key),
        })}
      />,
      (main, window) => {
        const [back, previous, next] = main.querySelectorAll<HTMLButtonElement>(
          '.search-bar > .nav-button, .search-steps button',
        );
        clicked(previous);
        clicked(next);
        clicked(back);
        const input = main.querySelector('input');
        assert.ok(input);
        act(() => {
          input.dispatchEvent(
            new window.KeyboardEvent('keydown', {
              key: 'Enter',
              bubbles: true,
            }),
          );
        });
      },
    );
    assert.deepStrictEqual(steps, [-1, 1]);
    assert.strictEqual(closed, 1);
    assert.deepStrictEqual(keys, ['Enter']);
  });

  test('types in the font of what it searches, monospace where it searches code and file names, and the font of the app elsewhere', () => {
    assert.strictEqual(barClassOf('monospace'), 'toolbar search-bar monospace');
    assert.strictEqual(barClassOf('proportional'), 'toolbar search-bar');
  });

  test('turns the previous and next buttons off while nothing matches', () => {
    assert.deepStrictEqual(disabled(0), [true, true]);
    assert.deepStrictEqual(disabled(3), [false, false]);
  });

  test('leaves the back and step buttons out where the search has none, as the shortcuts do', () => {
    assert.deepStrictEqual(
      classesOf(
        page({ onClose: undefined, onStep: undefined }).querySelector(
          '.search-bar',
        ),
      ),
      ['search-box active'],
    );
  });

  test('draws a compact form for menus, the box with the counter and the toggles as small buttons inside its right end, with no back or step buttons', () => {
    const document = page({ compact: true, placeholder: 'Filter…' });
    assert.strictEqual(
      document.querySelector('.search-bar')?.className,
      'toolbar search-bar compact',
    );
    assert.deepStrictEqual(classesOf(document.querySelector('.search-bar')), [
      'search-box active',
    ]);
    assert.deepStrictEqual(classesOf(document.querySelector('.search-box')), [
      'search-box-input',
      'search-count',
      'search-toggles',
    ]);
    assert.deepStrictEqual(
      Array.from(document.querySelectorAll('.search-toggle'), (toggle) => [
        toggle.className,
        toggle.getAttribute('tabindex'),
      ]),
      [
        ['search-toggle', '-1'],
        ['search-toggle', '-1'],
        ['search-toggle', '-1'],
      ],
    );
    assert.strictEqual(
      document.querySelector('input')?.getAttribute('placeholder'),
      'Filter…',
    );
  });
});
