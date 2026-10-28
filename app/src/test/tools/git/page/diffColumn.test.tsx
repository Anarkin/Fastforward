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
    pinned: false,
    canShow: true,
    showWhitespace: false,
    ignoreWhitespace: true,
    wordWrap: false,
    onEntire: noop,
    onPin: noop,
    onShowWhitespace: noop,
    onIgnoreWhitespace: noop,
    onWordWrap: noop,
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

function entireFileButtons(
  entire: boolean,
  pinned: boolean,
  canShow = true,
  ignoreWhitespace = true,
  wordWrap = false,
  showWhitespace = false,
) {
  const html = renderToStaticMarkup(
    <DiffOptions
      {...diffOptionsProps({
        entire,
        pinned,
        canShow,
        ignoreWhitespace,
        wordWrap,
        showWhitespace,
      })}
    />,
  );
  return [...html.matchAll(/<button[^>]*>/g)]
    .slice(0, 5)
    .map(([button]) =>
      [
        button.includes('aria-pressed="true"') ? 'on' : 'off',
        button.includes('disabled') ? 'disabled' : 'enabled',
      ].join(' '),
    );
}

suite('Diff options', () => {
  test('shows the file entire for now, or pinned for every file', () => {
    assert.deepStrictEqual(entireFileButtons(false, false), [
      'off enabled',
      'off enabled',
      'off enabled',
      'off enabled',
      'off enabled',
    ]);
    assert.deepStrictEqual(entireFileButtons(true, false), [
      'on enabled',
      'off enabled',
      'off enabled',
      'off enabled',
      'off enabled',
    ]);
    assert.deepStrictEqual(entireFileButtons(false, true), [
      'on disabled',
      'on enabled',
      'off enabled',
      'off enabled',
      'off enabled',
    ]);
  });

  test('offers the entire file only with a file selected, but the pin always', () => {
    assert.deepStrictEqual(entireFileButtons(false, false, false), [
      'off disabled',
      'off enabled',
      'off enabled',
      'off enabled',
      'off enabled',
    ]);
  });

  test('shows whitespace, shows whitespace changes and wraps long lines on their own toggles, pressed while on, the two for whitespace apart from wrapping, and all of them apart from the others on both sides', () => {
    assert.deepStrictEqual(
      entireFileButtons(false, false, true, true, false, true),
      [
        'off enabled',
        'off enabled',
        'on enabled',
        'off enabled',
        'off enabled',
      ],
    );
    assert.deepStrictEqual(entireFileButtons(false, false, true, false), [
      'off enabled',
      'off enabled',
      'off enabled',
      'on enabled',
      'off enabled',
    ]);
    assert.deepStrictEqual(entireFileButtons(false, false, true, true, true), [
      'off enabled',
      'off enabled',
      'off enabled',
      'off enabled',
      'on enabled',
    ]);
    const html = renderToStaticMarkup(<DiffOptions {...diffOptionsProps()} />);
    assert.match(
      html,
      /<\/button><\/span><span class="nav-button-space"><\/span><button[^>]*title="Show Whitespace"[^>]*>.*?<\/button><button[^>]*title="Show Whitespace Changes"[^>]*>.*?<\/button><span class="nav-button-space"><\/span><button[^>]*title="Wrap Long Lines"[^>]*>.*?<\/button><span class="nav-button-space"><\/span><div class="segmented"/,
    );
  });

  test('holds the pin together with the entire file button, filling both as one while pinned', () => {
    for (const pinned of [false, true]) {
      const html = renderToStaticMarkup(
        <DiffOptions {...diffOptionsProps({ pinned })} />,
      );
      assert.match(
        html,
        new RegExp(
          `^<div[^>]*><span class="pin-pair ${pinned ? 'pinned' : ''}"><button[^>]*title="Show the Entire File"[^>]*>.*?</button><button[^>]*title="Pin Entire Files"[^>]*>.*?</button></span>`,
        ),
      );
    }
  });

  test('names each toggle by what it does while pressed, keeping the name whether it is pressed or not', () => {
    assert.deepStrictEqual(diffOptionTitles({}).slice(0, 5), [
      'Show the Entire File',
      'Pin Entire Files',
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
      }).slice(0, 5),
      [
        'Show the Entire File',
        'Pin Entire Files',
        'Show Whitespace',
        'Show Whitespace Changes',
        'Wrap Long Lines',
      ],
    );
    assert.deepStrictEqual(diffOptionTitles({ pinned: true }).slice(0, 2), [
      'Show the Entire File',
      'Pin Entire Files',
    ]);
  });

  test('holds the inline and side by side buttons together, as only one of them is on at a time', () => {
    const html = renderToStaticMarkup(<DiffOptions {...diffOptionsProps()} />);
    assert.match(
      html,
      /<div class="segmented" role="group" aria-label="Layout"><button[^>]*title="Inline"[^>]*>.*?<\/button><button[^>]*title="Side by Side"[^>]*>.*?<\/button><\/div><\/div>$/,
    );
  });

  test('shows the entire file, pins it, shows whitespace, shows whitespace changes and wraps long lines on their toggles, and stops on them again', () => {
    for (const on of [false, true]) {
      const flipped: boolean[] = [];
      const flip = (value: boolean) => {
        flipped.push(value);
      };
      const toggles: Partial<DiffOptionsProps>[] = [
        { entire: on, onEntire: flip },
        { pinned: on, onPin: flip },
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
      assert.deepStrictEqual(flipped, [!on, !on, !on, !on, !on]);
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
