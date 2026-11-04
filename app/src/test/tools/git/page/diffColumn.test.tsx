import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { DiffOptions } from '../../../../tools/git/page/diffColumn';
import { noop } from '../../../fixtures';

type DiffOptionsProps = Parameters<typeof DiffOptions>[0];

function diffOptionsProps(
  overrides: Partial<DiffOptionsProps> = {},
): DiffOptionsProps {
  return {
    entire: false,
    showWhitespace: false,
    ignoreWhitespace: true,
    wordWrap: false,
    onEntire: noop,
    onShowWhitespace: noop,
    onIgnoreWhitespace: noop,
    onWordWrap: noop,
    language: <span className="language-slot" />,
    layout: 'inline',
    onLayout: noop,
    ...overrides,
  };
}

type OptionElement = React.ReactElement<{
  title?: string;
  'aria-pressed'?: boolean;
  onClick?: () => void;
  children?: OptionElement[];
}>;

function diffOptionButtons(overrides: Partial<DiffOptionsProps> = {}) {
  const element = DiffOptions(diffOptionsProps(overrides));
  assert.ok(isValidElement<{ children: OptionElement[] }>(element));
  return element.props.children.flatMap((child) =>
    child.type === 'button' ? [child] : (child.props.children ?? []),
  );
}

function diffOptionTitles(overrides: Partial<DiffOptionsProps>) {
  return diffOptionButtons(overrides).map((button) => button.props.title);
}

function optionButtons(overrides: Partial<DiffOptionsProps> = {}) {
  const html = renderToStaticMarkup(
    <DiffOptions {...diffOptionsProps(overrides)} />,
  );
  return [...html.matchAll(/<button[^>]*>/g)]
    .slice(0, 4)
    .map(([button]) =>
      [
        button.includes('aria-pressed="true"') ? 'on' : 'off',
        button.includes('disabled') ? 'disabled' : 'enabled',
      ].join(' '),
    );
}

suite('Diff options', () => {
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
    const html = renderToStaticMarkup(<DiffOptions {...diffOptionsProps()} />);
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
    const html = renderToStaticMarkup(<DiffOptions {...diffOptionsProps()} />);
    assert.match(
      html,
      /<div class="segmented" role="group" aria-label="Layout"><button[^>]*title="Inline"[^>]*>.*?<\/button><button[^>]*title="Side by Side"[^>]*>.*?<\/button><\/div><\/div>$/,
    );
  });

  test('shows the entire file, shows whitespace, shows whitespace changes, and wraps long lines on their toggles, and stops on them again', () => {
    for (const on of [false, true]) {
      const flipped: boolean[] = [];
      const flip = (value: boolean) => {
        flipped.push(value);
      };
      const toggles: Partial<DiffOptionsProps>[] = [
        { entire: on, onEntire: flip },
        { showWhitespace: on, onShowWhitespace: flip },
        {
          ignoreWhitespace: !on,
          onIgnoreWhitespace: (ignore: boolean) => flip(!ignore),
        },
        { wordWrap: on, onWordWrap: flip },
      ];
      toggles.forEach((overrides, index) => {
        const button = diffOptionButtons(overrides)[index];
        assert.strictEqual(button.props['aria-pressed'], on);
        button.props.onClick?.();
      });
      assert.deepStrictEqual(flipped, [!on, !on, !on, !on]);
    }
  });

  test('shows the diff inline or side by side, the chosen layout pressed, switching on the other', () => {
    for (const layout of ['inline', 'sideBySide'] as const) {
      const picked: string[] = [];
      const buttons = diffOptionButtons({
        layout,
        onLayout: (next) => picked.push(next),
      }).filter(
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
      assert.deepStrictEqual(picked, ['inline', 'sideBySide']);
    }
  });
});
