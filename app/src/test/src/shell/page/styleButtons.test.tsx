import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { Column } from '../../../../lib/page/column';
import { cascaded } from '../../../helpers/cascade';
import {
  AboutPopupShown,
  MenuButtonShown,
  NoticesShown,
  SearchButtonShown,
  ShortcutsPopupShown,
  TabBarIn,
  TabBarShown,
} from '../../../helpers/styleFixtures';
import { popupOf } from '../../../helpers/styleMarkup';
import {
  noop,
  looks,
  looksAlike,
  bodyVariable,
  halved,
  deviceRounded,
  hovered,
} from './stylesheetFixtures';
import { emptyTabView } from '../../../../tools/git/page/shownTab';
import { SoloButton } from '../../../../tools/git/page/soloButton';
import { createGitStore, GitStore } from '../../../../tools/git/page/store';
import { renderedBy } from '../../../helpers/componentFixtures';
import { allWithClass, rendered, withClass } from '../../../helpers/markup';
import { DiffOptionsShown } from '../../../helpers/styleDiffFixtures';
import { NavButtonsShown } from '../../../helpers/styleHistoryFixtures';

function SoloButtonShown({
  solo,
  applying,
}: {
  readonly solo: boolean;
  readonly applying: boolean;
}) {
  return (
    <GitStore
      value={createGitStore(noop, {
        solo,
        tab: { ...emptyTabView, applyingSolo: applying },
      })}
    >
      <SoloButton />
    </GitStore>
  );
}

suite('Style', () => {
  test('sizes every button of a bar and spaces every group of them by one size and one gap, each a whole number of screen pixels, so no gap is drawn wider than another at 125%', () => {
    assert.strictEqual(deviceRounded('button-size'), 26);
    assert.strictEqual(deviceRounded('bar-space'), 4);
    assert.strictEqual(deviceRounded('arrowed-button-width'), 44);
    const nav = rendered(<NavButtonsShown autoFetch autoFetchMinutes={5} />);
    const options = rendered(<DiffOptionsShown />);
    for (const group of [
      withClass(nav, 'toolbar'),
      withClass(nav, 'pin-pair'),
      ...allWithClass(options, 'toolbar'),
      withClass(
        rendered(
          renderedBy(Column, {
            actions: <span />,
            children: null,
          }),
        ),
        'column-actions',
      ),
    ]) {
      looks(group, { gap: 'var(--bar-space)' });
    }
    const buttons = [
      ...allWithClass(nav, 'nav-button'),
      ...allWithClass(options, 'nav-button'),
    ];
    assert.ok(buttons.length > 8);
    for (const button of buttons) {
      looks(button, {
        width: 'var(--button-size)',
        height: 'var(--button-size)',
      });
    }
    looks(withClass(rendered(<SearchButtonShown />), 'search-button'), {
      width: 'var(--button-size)',
    });
    assert.strictEqual(
      cascaded(
        rendered(renderedBy(Column, { children: null })),
        '--search-height',
      ),
      'var(--button-size)',
    );
  });

  test('shades a button of a bar on hover over whatever fill it has, so an active toggle changes too', () => {
    const pinned = rendered(<NavButtonsShown autoFetch autoFetchMinutes={5} />);
    const enabled = [
      pinned,
      rendered(<DiffOptionsShown ignoreWhitespace={false} />),
    ].flatMap((root) =>
      allWithClass(root, 'nav-button').filter(
        (button) => !button.attributes.has('disabled'),
      ),
    );
    const filled = enabled.filter((button) =>
      button.classes.includes('active'),
    );
    assert.strictEqual(filled.length, 3);
    for (const button of enabled) {
      const half = halved(cascaded(button, 'width'));
      looks(button, { 'border-radius': 'var(--radius)' });
      looks(
        button,
        { 'box-shadow': `inset 0 0 0 ${half} var(--hover-background)` },
        hovered,
      );
    }
    for (const button of filled) {
      looksAlike(button, ['background'], hovered);
    }
    const disabled = withClass(pinned, 'nav-button');
    assert.ok(disabled.attributes.has('disabled'));
    looks(disabled, { 'box-shadow': undefined }, hovered);
  });

  test("fills every button of a bar in the border color, but in the color of the tab bar or a popup's title it sits on, showing no circle there, tinting the button of an open menu, the + one too, over its fill and ringing a button's dot in it", () => {
    assert.strictEqual(
      bodyVariable('button-background'),
      'var(--color-border)',
    );
    for (const bar of [
      withClass(rendered(<TabBarShown />), 'tabs'),
      withClass(popupOf(<ShortcutsPopupShown />), 'shortcuts-title'),
      withClass(popupOf(<AboutPopupShown />), 'shortcuts-title'),
    ]) {
      looks(bar, {
        background: 'var(--color-background)',
        '--button-background': 'var(--color-background)',
      });
    }
    const diff = rendered(<DiffOptionsShown />);
    for (const button of [
      ...allWithClass(rendered(<NavButtonsShown />), 'nav-button'),
      ...allWithClass(diff, 'nav-button').filter(
        (option) => !option.classes.includes('active'),
      ),
      withClass(rendered(<MenuButtonShown />), 'nav-button'),
      withClass(popupOf(<ShortcutsPopupShown />), 'nav-button'),
    ]) {
      assert.ok(!button.classes.includes('active'));
      looks(button, { background: 'var(--button-background)' });
    }
    for (const open of [
      rendered(<button className="nav-button menu-button-trigger open" />),
      withClass(rendered(<TabBarIn maximized={false} adding />), 'tab-add'),
    ]) {
      looks(open, {
        background:
          'linear-gradient(var(--hover-background), var(--hover-background)), var(--button-background)',
      });
    }
    assert.match(
      cascaded(
        withClass(rendered(<MenuButtonShown marked />), 'menu-mark'),
        'box-shadow',
      ) ?? '',
      /^0 0 0 \S+ var\(--button-background\)$/,
    );
  });

  test('tints a hovered button like a hovered row, and a switched-on toggle as strongly as a selection, both see-through', () => {
    assert.strictEqual(
      bodyVariable('toggle-on-background'),
      'color-mix( in srgb, var(--color-focus) var(--color-focus-selected), transparent )',
    );
    for (const button of [
      withClass(rendered(<TabBarShown />), 'tab-close'),
      withClass(rendered(<NoticesShown />), 'card-close'),
    ]) {
      looks(button, { background: 'var(--hover-background)' }, hovered);
    }
    looks(rendered(<SoloButtonShown solo applying={false} />), {
      background: 'var(--toggle-on-background)',
    });
  });

  test('spins the icon of a running button', () => {
    for (const icon of [
      withClass(rendered(<NavButtonsShown fetching />), 'spin-icon'),
      withClass(
        rendered(<SoloButtonShown solo={false} applying />),
        'spin-icon',
      ),
    ]) {
      assert.match(
        cascaded(icon, 'animation') ?? '',
        /^spin \S+ linear infinite$/,
      );
    }
    looks(withClass(rendered(<NavButtonsShown />), 'spin-icon'), {
      animation: undefined,
    });
  });

  test('marks the fetch button in the warning color while stale and the error color when failed, as a dot outside the spinning icon', () => {
    const stale = rendered(
      <NavButtonsShown
        lastFetch={{ succeeded: 0 }}
        autoFetch
        autoFetchMinutes={1}
      />,
    );
    const failed = rendered(<NavButtonsShown lastFetch={{ failed: 0 }} />);
    for (const [root, color] of [
      [stale, 'warning'],
      [failed, 'error'],
    ] as const) {
      const mark = withClass(root, 'fetch-mark');
      looks(mark, {
        position: 'absolute',
        'border-radius': '50%',
        background: `var(--color-${color}-foreground)`,
      });
      looks(mark?.parent, { position: 'relative' });
      assert.ok(!mark?.parent?.classes.includes('spin-icon'));
    }
  });

  test('marks the menu button in the focus color while an update waits, as a dot like the one on the fetch button', () => {
    const mark = withClass(rendered(<MenuButtonShown marked />), 'menu-mark');
    const fetchMark = withClass(
      rendered(<NavButtonsShown lastFetch={{ failed: 0 }} />),
      'fetch-mark',
    );
    looks(mark, {
      position: cascaded(fetchMark, 'position'),
      'border-radius': cascaded(fetchMark, 'border-radius'),
      background: 'var(--color-focus)',
    });
    looks(mark?.parent, { position: 'relative' });
    assert.deepStrictEqual(
      allWithClass(rendered(<MenuButtonShown />), 'menu-mark'),
      [],
    );
  });
});
