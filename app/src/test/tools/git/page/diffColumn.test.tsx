import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import {
  DiffLanguage,
  DiffOptions,
} from '../../../../tools/git/page/diffColumn';
import {
  createGitStore,
  languageKeyOf,
  pickedFor,
} from '../../../../tools/git/page/store';
import { emptyTabView } from '../../../../tools/git/page/tabView';
import { createShellStore } from '../../../../shell/page/store';
import { defaultTextView } from '../../../../ui/textView';
import {
  inStores,
  optionStores,
  type ShownOptions,
} from '../../../componentFixtures';

const language = <span className="language-slot" />;

type OptionElement = React.ReactElement<{
  title?: string;
  'aria-pressed'?: boolean;
  onClick?: () => void;
  children?: OptionElement[];
}>;

function diffOptionButtons(shown: ShownOptions = {}, posted: unknown[] = []) {
  let element: React.ReactNode;
  function Probe() {
    element = DiffOptions({ language });
    return null;
  }
  renderToStaticMarkup(
    inStores(
      optionStores(shown, (message) => posted.push(message)),
      <Probe />,
    ),
  );
  assert.ok(isValidElement<{ children: OptionElement[] }>(element));
  return element.props.children.flatMap((child) =>
    child.type === 'button' ? [child] : (child.props.children ?? []),
  );
}

function diffOptionTitles(shown: ShownOptions) {
  return diffOptionButtons(shown).map((button) => button.props.title);
}

function optionsHtml(shown: ShownOptions = {}) {
  return renderToStaticMarkup(
    inStores(optionStores(shown), <DiffOptions language={language} />),
  );
}

function optionButtons(shown: ShownOptions = {}) {
  return [...optionsHtml(shown).matchAll(/<button[^>]*>/g)]
    .slice(0, 4)
    .map(([button]) =>
      [
        button.includes('aria-pressed="true"') ? 'on' : 'off',
        button.includes('disabled') ? 'disabled' : 'enabled',
      ].join(' '),
    );
}

suite('Diff options', () => {
  test('forgets the language picked for a file once another file is shown, as it did before the pick was kept in the store, so the file shows in the language its name tells on coming back', async () => {
    const dom = new JSDOM('<!doctype html><main></main>');
    const globals = {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    const saved = Object.fromEntries(
      Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
    );
    Object.assign(globalThis, globals);
    try {
      const { createRoot } = await import('react-dom/client');
      const main = dom.window.document.querySelector('main');
      assert.ok(main);
      const root = createRoot(main);
      const tab = { ...emptyTabView, root: '/repo', hash: 'h', path: 'a.txt' };
      const git = createGitStore(() => undefined, { tab });
      const shell = createShellStore(() => undefined);
      const show = (path: string) =>
        act(async () => {
          git.setState({ tab: { ...tab, path } });
          root.render(
            inStores({ git, shell }, <DiffLanguage comparing={undefined} />),
          );
        });
      await show('a.txt');
      const key = languageKeyOf(undefined, tab);
      git.getState().pickLanguage(key, 'python');
      await show('a.txt');
      assert.strictEqual(pickedFor(key)(git.getState()), 'python');
      await show('b.txt');
      await show('a.txt');
      assert.strictEqual(pickedFor(key)(git.getState()), undefined);
      await act(async () => root.unmount());
    } finally {
      Object.assign(globalThis, saved);
    }
  });

  test('shows the file entire on one toggle, kept for every file, and offers it whatever is selected, as it applies whenever one file is shown', () => {
    assert.deepStrictEqual(optionButtons(), [
      'off enabled',
      'off enabled',
      'off enabled',
      'off enabled',
    ]);
    assert.deepStrictEqual(optionButtons({ entire: true }), [
      'on enabled',
      'off enabled',
      'off enabled',
      'off enabled',
    ]);
  });

  test('shows whitespace, shows whitespace changes and wraps long lines on their own toggles, pressed while on, the two for whitespace apart from wrapping, all of them apart from the others on both sides, and the language menu on its own after the entire file, as the viewer has it before its toggles', () => {
    assert.deepStrictEqual(optionButtons({ showWhitespace: true }), [
      'off enabled',
      'on enabled',
      'off enabled',
      'off enabled',
    ]);
    assert.deepStrictEqual(optionButtons({ ignoreWhitespace: false }), [
      'off enabled',
      'off enabled',
      'on enabled',
      'off enabled',
    ]);
    assert.deepStrictEqual(optionButtons({ wordWrap: true }), [
      'off enabled',
      'off enabled',
      'off enabled',
      'on enabled',
    ]);
    const html = optionsHtml();
    assert.match(
      html,
      /^<div[^>]*><button[^>]*title="Show the Entire File"[^>]*>.*?<\/button><span class="nav-button-space"><\/span><span class="language-slot"><\/span><span class="nav-button-space"><\/span><button[^>]*title="Show Whitespace"[^>]*>.*?<\/button><button[^>]*title="Show Whitespace Changes"[^>]*>.*?<\/button><span class="nav-button-space"><\/span><button[^>]*title="Wrap Long Lines"[^>]*>.*?<\/button><span class="nav-button-space"><\/span><div class="segmented"/,
    );
  });

  test('names each toggle by what it does while pressed, keeping the name whether it is pressed or not', () => {
    assert.deepStrictEqual(diffOptionTitles({}).slice(0, 4), [
      'Show the Entire File',
      'Show Whitespace',
      'Show Whitespace Changes',
      'Wrap Long Lines',
    ]);
    assert.deepStrictEqual(
      diffOptionTitles({
        entire: true,
        showWhitespace: true,
        ignoreWhitespace: false,
        wordWrap: true,
      }).slice(0, 4),
      [
        'Show the Entire File',
        'Show Whitespace',
        'Show Whitespace Changes',
        'Wrap Long Lines',
      ],
    );
  });

  test('holds the inline and side by side buttons together, as only one of them is on at a time', () => {
    const html = optionsHtml();
    assert.match(
      html,
      /<div class="segmented" role="group" aria-label="Layout"><button[^>]*title="Inline"[^>]*>.*?<\/button><button[^>]*title="Side by Side"[^>]*>.*?<\/button><\/div><\/div>$/,
    );
  });

  test('shows the entire file, shows whitespace, shows whitespace changes, and wraps long lines on their toggles, and stops on them again', () => {
    for (const on of [false, true]) {
      const toggles: ShownOptions[] = [
        { entire: on },
        { showWhitespace: on },
        { ignoreWhitespace: !on },
        { wordWrap: on },
      ];
      const posted = toggles.map((shown, index) => {
        const sent: unknown[] = [];
        const button = diffOptionButtons(shown, sent)[index];
        assert.strictEqual(button.props['aria-pressed'], on);
        button.props.onClick?.();
        return sent;
      });
      assert.deepStrictEqual(posted, [
        [{ type: 'setShowEntireFile', show: !on }],
        [
          {
            type: 'setTextView',
            view: { ...defaultTextView, wordWrap: false, showWhitespace: !on },
          },
        ],
        [{ type: 'setIgnoreWhitespace', ignore: on }],
        [
          {
            type: 'setTextView',
            view: { ...defaultTextView, wordWrap: !on, showWhitespace: false },
          },
        ],
      ]);
    }
  });

  test('shows the diff inline or side by side, the chosen layout pressed, switching on the other', () => {
    for (const layout of ['inline', 'sideBySide'] as const) {
      const posted: unknown[] = [];
      const buttons = diffOptionButtons({ layout }, posted).filter(
        (button) =>
          button.props.title === 'Inline' ||
          button.props.title === 'Side by Side',
      );
      assert.deepStrictEqual(
        buttons.map((button) => [
          button.props.title,
          button.props['aria-pressed'],
        ]),
        [
          ['Inline', layout === 'inline'],
          ['Side by Side', layout === 'sideBySide'],
        ],
      );
      for (const button of buttons) {
        button.props.onClick?.();
      }
      assert.deepStrictEqual(posted, [
        { type: 'setDiffLayout', layout: 'inline' },
        { type: 'setDiffLayout', layout: 'sideBySide' },
      ]);
    }
  });
});
