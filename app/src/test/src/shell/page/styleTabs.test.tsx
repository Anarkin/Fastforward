import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { columnsClass } from '../../../../tools/git/page/columnsShown';
import { TabBar } from '../../../../shell/page/tabBar';
import { cascaded, type States } from '../../../helpers/cascade';
import {
  Columns,
  MenuButtonShown,
  TabBarIn,
  TabBarShown,
} from '../../../helpers/styleFixtures';
import { worktree } from '../../../helpers/styleMarkup';
import {
  keyframe,
  noop,
  looks,
  bodyVariable,
  lengthOf,
  paddingOf,
  layer,
  hovered,
  after,
} from './stylesheetFixtures';
import { createShellStore, ShellStore } from '../../../../shell/page/store';
import { tabsStore } from '../../../helpers/componentFixtures';
import { createElement } from 'react';
import { stylesheet } from '../../../helpers/pageSources';
import {
  allWithClass,
  rendered,
  withClass,
  type MarkupElement,
} from '../../../helpers/markup';
import { WorktreeBarShown } from '../../../helpers/styleHistoryFixtures';

function TabRow({
  count,
  active,
}: {
  readonly count: number;
  readonly active: string;
}) {
  return (
    <ShellStore
      value={tabsStore(
        ['a', 'b', 'c'].slice(0, count).map((name) => ({
          id: `/${name}`,
          tool: 'git' as const,
          root: `/${name}`,
          name,
        })),
        active,
      )}
    >
      <TabBar />
    </ShellStore>
  );
}

function appIconSpacing(tabBar: React.ReactElement) {
  const bar = rendered(tabBar);
  const menu = withClass(bar, 'menu-button');
  const button = withClass(menu, 'nav-button');
  const icon = withClass(menu, 'title-bar-icon');
  const iconWidth = lengthOf(cascaded(icon, 'width'));
  const inside = (lengthOf(cascaded(button, 'width')) - iconWidth) / 2;
  const leading = lengthOf(paddingOf(withClass(bar, 'tabs')).left) + inside;
  const trailing =
    inside +
    lengthOf(cascaded(menu, 'margin-right')) +
    lengthOf(cascaded(withClass(bar, 'tabs'), 'gap'));
  return { leading, trailing, tabStart: leading + iconWidth + trailing };
}

function tabStrip(maximized: boolean, overflowing: boolean): MarkupElement {
  return withClass(
    rendered(
      createElement(
        'div',
        maximized ? { 'data-maximized': '' } : {},
        createElement(
          'nav',
          { className: 'tabs' },
          createElement('div', {
            className: overflowing ? 'tab-strip overflowing' : 'tab-strip',
          }),
        ),
      ),
    ),
    'tab-strip',
  );
}

function divider(tab: MarkupElement): MarkupElement {
  return withClass(tab, 'tab-divider');
}

const shown = (tab: MarkupElement, states?: States) =>
  cascaded(divider(tab), 'visibility', states) !== 'hidden';

suite('Style', () => {
  test('grows an opened tab from nothing and shrinks a closed one to nothing, its gap with it, as Chrome does, clipping what does not fit yet', () => {
    const bar = rendered(
      <nav className="tabs">
        <div className="tab active opening" />
        <div className="tab closing" />
      </nav>,
    );
    const [opening, closing] = allWithClass(bar, 'tab');
    looks(opening, {
      'overflow-x': 'clip',
      animation: 'tab-open 0.2s ease-out',
    });
    looks(closing, {
      'overflow-x': 'clip',
      'pointer-events': 'none',
      animation: 'tab-close 0.2s ease-out forwards',
    });
    const gone = keyframe('tab-open', 'from');
    assert.ok(gone);
    assert.strictEqual(keyframe('tab-close', 'to'), gone);
    for (const declaration of [
      'width: 0;',
      'min-width: 0;',
      'padding-right: 0;',
      'padding-left: 0;',
      'border-right-width: 0;',
      'border-left-width: 0;',
      'margin-right: calc(-1 * var(--tab-list-gap));',
    ]) {
      assert.ok(gone.includes(declaration), declaration);
    }
  });

  test('keeps the repository tabs on one row, shrinking them as Chrome does rather than wrapping them, down to a letter or two of the name beside the close button, every tab as narrow as the open one may be, so a tab opened takes no room from the others and moves none of them', () => {
    looks(withClass(rendered(<TabBarShown />), 'tab-list'), {
      'flex-wrap': 'nowrap',
      overflow: undefined,
      'overflow-x': undefined,
    });
    looks(withClass(rendered(<TabBarShown />), 'tab-strip'), {
      display: 'flex',
      'flex-wrap': undefined,
      'align-items': 'flex-end',
      'flex-shrink': '1',
      'min-width': '0',
    });
    const [active, other] = allWithClass(rendered(<TabBarShown />), 'tab');
    const gap = cascaded(active, 'gap');
    const close = cascaded(withClass(active, 'tab-close'), 'width');
    const icon = cascaded(withClass(active, 'tool-icon'), 'width');
    const name = cascaded(withClass(active, 'tab-name'), 'min-width');
    const { left, right } = paddingOf(active);
    const [border] = (cascaded(active, 'border') ?? '').split(' ');
    const frame = `${left} + ${right} + 2 * ${border}`;
    looks(active, {
      'flex-shrink': '1',
      'box-sizing': 'border-box',
      'min-width': `calc(${icon} + ${name} + 3 * ${gap} + ${close} + ${frame})`,
    });
    looks(other, {
      'flex-shrink': '1',
      'box-sizing': 'border-box',
      'min-width': `calc(${icon} + ${name} + 3 * ${gap} + ${close} + ${frame})`,
    });
    for (const tab of [active, other]) {
      looks(withClass(tab, 'tab-name'), {
        'min-width': '2ch',
        overflow: 'hidden',
        'text-overflow': 'ellipsis',
      });
    }
    for (const button of [
      withClass(active, 'tab-close'),
      withClass(rendered(<TabBarShown />), 'tab-add'),
    ]) {
      looks(button, { flex: 'none' });
    }
  });

  test('makes every repository tab 200 pixels wide, however short or long its name, with its close button at its right edge, sharing the room out alike once they no longer fit, so a short name is not cut down sooner than a long one', () => {
    for (const tab of allWithClass(rendered(<TabBarShown />), 'tab')) {
      looks(tab, {
        flex: undefined,
        'flex-grow': undefined,
        'flex-basis': undefined,
        'flex-shrink': '1',
        'box-sizing': 'border-box',
        width: '200px',
        'max-width': undefined,
      });
      looks(withClass(tab, 'tab-close'), { 'margin-left': 'auto' });
    }
  });

  test('makes every repository tab as tall as the menu button of the app beside them, as a height of its own rather than its content, padding and border added up, as Chromium draws a border of a pixel on whole device pixels and the tab came out half a device pixel short at 125% and a whole one at 150%', () => {
    const shownBar = rendered(<TabBarShown />);
    const button = cascaded(withClass(shownBar, 'menu-button'), 'height');
    assert.strictEqual(button, 'calc(max(1lh, 20px) + 8px)');
    for (const tab of allWithClass(shownBar, 'tab')) {
      looks(tab, { height: button, 'box-sizing': 'border-box' });
    }
  });

  test('pads a repository tab as far from its icon at its left as above and below it, and its close button as far from its right edge as from its top, so the space around each is even', () => {
    const [tab] = allWithClass(rendered(<TabBarShown />), 'tab');
    assert.ok(tab);
    const { top, right, bottom, left } = paddingOf(tab);
    const room = 20;
    const icon = parseFloat(
      cascaded(withClass(tab, 'tool-icon'), 'width') ?? '',
    );
    assert.strictEqual(top, bottom);
    assert.strictEqual(parseFloat(left), parseFloat(top) + (room - icon) / 2);
    assert.strictEqual(right, top);
  });

  test("rounds the repository tabs by the one radius of the app, as the sheet's corners and the worktree chips, which is none for now, every corner square", () => {
    assert.strictEqual(bodyVariable('radius'), '0px');
    for (const tab of allWithClass(rendered(<TabBarShown />), 'tab')) {
      looks(tab, { 'border-radius': 'var(--radius)' });
    }
  });

  test('gives up the close button of a tab not open, as Chrome does, only once its name is down to its first letters, then wholly, as flexbox shrinks items whose factors add up to less than one only partly', () => {
    const [, other] = allWithClass(rendered(<TabBarShown />), 'tab');
    const close = withClass(other, 'tab-close');
    looks(close, { 'min-width': '0', overflow: 'hidden' });
    const closeShrink = Number(cascaded(close, 'flex-shrink'));
    assert.ok(closeShrink >= 1);
    assert.ok(
      closeShrink <
        Number(cascaded(withClass(other, 'tab-name'), 'flex-shrink') ?? '1') /
          100,
    );
  });

  test("shrinks a repository tab's folder away before its name", () => {
    const [, tab] = allWithClass(rendered(<TabBarShown />), 'tab');
    looks(withClass(tab, 'tab-folder'), {
      'min-width': '0',
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
    });
    assert.ok(
      Number(cascaded(withClass(tab, 'tab-folder'), 'flex-shrink')) >
        Number(cascaded(withClass(tab, 'tab-name'), 'flex-shrink') ?? '1'),
    );
  });

  test('lays the repository tabs out as ever while they fit, cutting nothing off, and never drags the window by them, as the places the window is dragged by would stay put while they scroll', () => {
    for (const maximized of [false, true]) {
      looks(tabStrip(maximized, false), {
        'overflow-x': undefined,
        'padding-left': undefined,
        'padding-right': undefined,
        'padding-top': undefined,
        'padding-bottom': undefined,
        margin: undefined,
        'margin-top': undefined,
        'margin-bottom': undefined,
        '-webkit-app-region': 'no-drag',
      });
    }
  });

  test('scrolls the repository tabs sideways without a scrollbar once even their narrowest is too wide, as Chrome does, scrolled by the wheel alone so it gets no overlay scrollbar over the tabs, leaving room above them in a maximized window for a tab to reach up, so that is not cut off, every tab a box of its own within the strip', () => {
    const [, other] = allWithClass(rendered(<TabBarIn maximized />), 'tab');
    const reach = cascaded(other, 'height', { pseudoElement: '::before' });
    for (const maximized of [false, true]) {
      looks(tabStrip(maximized, true), {
        'overflow-x': 'hidden',
        'padding-left': undefined,
        'padding-right': undefined,
        'margin-left': undefined,
        'margin-right': undefined,
        'padding-top': maximized ? reach : undefined,
        'margin-top': maximized ? `calc(-1 * ${reach})` : undefined,
        'padding-bottom': undefined,
        'margin-bottom': undefined,
      });
    }
  });

  test('leaves room beside the repository tabs to drag the window by, however many are open', () => {
    const list = withClass(rendered(<TabBarShown />), 'tab-list');
    looks(list, { '-webkit-app-region': undefined });
    assert.ok(parseFloat(cascaded(list, 'padding-right') ?? '0') >= 32);
  });

  test('drags the window by the tab row, clear of the window buttons, but not by its tabs and buttons', () => {
    const css = stylesheet();
    assert.match(css, /\n\.tabs \{[^}]*-webkit-app-region: drag;/);
    assert.match(
      css,
      /\n\.tabs \{[^}]*100vw - env\(titlebar-area-x, 0px\) - env\(titlebar-area-width, 100vw\)[^}]*calc\(\s*env\(titlebar-area-x, 0px\) \+ var\(--app-icon-margin\) -\s*var\(--app-icon-padding\)\s*\);/,
    );
    assert.match(
      css,
      /:root\[data-platform='darwin'\] \.tabs \{[^}]*padding-left: 78px;/,
    );
    assert.match(
      css,
      /\.tabs \.tab,\n\.tabs \.tab-add,\n\.tabs \.menu-button \{[^}]*-webkit-app-region: no-drag;/,
    );
  });

  test('wraps the worktrees onto more rows rather than scrolling them sideways', () => {
    looks(
      withClass(
        rendered(
          <WorktreeBarShown worktrees={[worktree('a'), worktree('b')]} />,
        ),
        'tab-list',
      ),
      {
        'flex-wrap': 'wrap',
        overflow: undefined,
        'overflow-x': undefined,
      },
    );
  });

  test('draws the active repository tab as a box of its own in the color of the sheet under it, which holds the worktrees and the columns, as the box of a tab the pointer is on, apart from the sheet by the gap under every tab rather than joined to it', () => {
    const [tab, other] = allWithClass(rendered(<TabBarShown />), 'tab');
    assert.ok(tab.classes.includes('active'));
    looks(tab, {
      '--sheet': 'var(--repository-background)',
      background: 'var(--sheet)',
      'border-radius': 'var(--radius)',
      'margin-bottom': cascaded(other, 'margin-bottom'),
      'border-bottom-color': undefined,
    });
    for (const pseudoElement of ['::before', '::after']) {
      assert.strictEqual(
        cascaded(tab, 'box-shadow', { pseudoElement }),
        undefined,
      );
    }
    assert.strictEqual(
      bodyVariable('repository-background'),
      'var(--color-panel-background)',
    );
    looks(withClass(rendered(<div className="repository" />), 'repository'), {
      background: 'var(--repository-background)',
    });
  });

  test('keeps the name of a repository tab where it was once the tab is opened, the open tab padded and spaced from the sheet as every other', () => {
    const [active, other] = allWithClass(rendered(<TabBarShown />), 'tab');
    assert.ok(active.classes.includes('active'));
    assert.deepStrictEqual(paddingOf(active), paddingOf(other));
    assert.strictEqual(
      cascaded(active, 'margin-bottom'),
      cascaded(other, 'margin-bottom'),
    );
  });

  test('highlights a repository tab not open on hover as a box stopping short of the sheet, as Chrome does, its name and close button in the middle of it, still picking the tab from the gap under it', () => {
    const other = allWithClass(rendered(<TabBarShown />), 'tab').find(
      (tab) => !tab.classes.includes('active'),
    );
    assert.ok(other);
    const gap = cascaded(other, 'margin-bottom');
    assert.ok(parseFloat(gap ?? '') > 0);
    assert.strictEqual(paddingOf(other).top, paddingOf(other).bottom);
    looks(other, { background: 'var(--hover-background)' }, hovered);
    const [border] = (cascaded(other, 'border') ?? '').split(' ');
    looks(
      other,
      {
        content: "''",
        position: 'absolute',
        top: '100%',
        left: `-${border}`,
        right: `-${border}`,
        height: `calc(${gap} + ${border})`,
      },
      after,
    );
  });

  test('draws a divider in the middle of the gap after each repository tab, as Chrome does, but none beside the open tab or the one the pointer is on', () => {
    assert.strictEqual(
      bodyVariable('tab-divider'),
      'color-mix(in srgb, var(--color-foreground) 12%, transparent)',
    );
    const [a, b, c] = allWithClass(
      rendered(<TabRow count={3} active="/b" />),
      'tab',
    );
    const width = parseFloat(
      /[\d.]+px/.exec(cascaded(divider(a), 'width') ?? '')?.[0] ?? '',
    );
    const [border] = (cascaded(a, 'border') ?? '').split(' ');
    const gap = parseFloat(
      cascaded(
        withClass(rendered(<TabRow count={3} active="/b" />), 'tabs'),
        '--tab-list-gap',
      ) ?? '',
    );
    assert.strictEqual(gap, 4);
    looks(divider(a), {
      position: 'absolute',
      top: '50%',
      right: `${-(parseFloat(border) + gap / 2 + width / 2)}px`,
      width: 'round(2px, var(--device-pixel, 1px))',
      height: '16px',
      'border-radius': 'var(--radius)',
      background: 'var(--tab-divider)',
      transform: 'translateY(-50%)',
      'pointer-events': 'none',
    });
    assert.strictEqual(
      cascaded(
        withClass(rendered(<TabRow count={3} active="/b" />), 'tab-strip'),
        'gap',
      ),
      'inherit',
    );
    assert.deepStrictEqual(
      [a, b, c].map((tab) => shown(tab)),
      [false, false, true],
    );
    assert.deepStrictEqual(
      [a, b, c].map((tab) => shown(tab, { hover: c })),
      [false, false, false],
    );
    const [first, second, third] = allWithClass(
      rendered(<TabRow count={3} active="/a" />),
      'tab',
    );
    assert.deepStrictEqual(
      [first, second, third].map((tab) => shown(tab)),
      [false, true, true],
    );
    assert.deepStrictEqual(
      [first, second, third].map((tab) => shown(tab, { hover: second })),
      [false, false, true],
    );
  });

  test('drags the window by a lone repository tab, as Chrome does, there being no tab to move it past, but not by its close button', () => {
    const [lone] = allWithClass(
      rendered(<TabRow count={1} active="/a" />),
      'tab',
    );
    looks(lone, { '-webkit-app-region': 'drag' });
    looks(withClass(lone, 'tab-close'), { '-webkit-app-region': 'no-drag' });
    for (const tab of allWithClass(
      rendered(<TabRow count={2} active="/a" />),
      'tab',
    )) {
      looks(tab, { '-webkit-app-region': 'no-drag' });
    }
  });

  test('leaves a lone tab to the app while another window could take it, as dragging it then moves its window into that one rather than letting the system move the window', () => {
    const [lone] = allWithClass(
      rendered(
        <ShellStore
          value={createShellStore(noop, {
            tabs: [{ id: '/a', tool: 'git', root: '/a', name: 'a' }],
            active: '/a',
            tearsOff: true,
            windows: [{ id: '2', name: 'b' }],
          })}
        >
          <TabBar />
        </ShellStore>,
      ),
      'tab',
    );
    looks(lone, { '-webkit-app-region': 'no-drag' });
  });

  test('keeps a repository tab dragged over the others and right under the pointer, while the others slide into their places', () => {
    const row = rendered(
      <nav className="tabs">
        <div className="tab active dragging" />
        <div className="tab" />
      </nav>,
    );
    const [dragged, other] = allWithClass(row, 'tab');
    looks(dragged, { transition: 'none' });
    looks(other, { 'z-index': undefined });
    assert.ok(layer(dragged) > 0);
    assert.match(
      cascaded(other, 'transition') ?? '',
      /^transform \S+ ease-out$/,
    );
  });

  test('shapes the button opening a repository like the buttons beside it', () => {
    const add = withClass(rendered(<TabBarShown />), 'tab-add');
    const beside = withClass(rendered(<MenuButtonShown />), 'nav-button');
    assert.ok(add.classes.includes('nav-button'));
    looks(add, {
      width: cascaded(beside, 'width'),
      height: cascaded(beside, 'height'),
      'border-radius': cascaded(beside, 'border-radius'),
      background: 'var(--button-background)',
    });
    looks(
      add,
      {
        'box-shadow': cascaded(beside, 'box-shadow', hovered),
        background: 'var(--button-background)',
      },
      hovered,
    );
  });

  test('reaches each tab up to the top of a maximized window, the open one too, so the pointer flung there highlights and picks it, but not while the window is smaller', () => {
    const before = { pseudoElement: '::before' };
    for (const tab of allWithClass(rendered(<TabBarIn maximized />), 'tab')) {
      const [border] = (cascaded(tab, 'border') ?? '').split(' ');
      looks(
        tab,
        {
          content: "''",
          position: 'absolute',
          bottom: '100%',
          left: `-${border}`,
          right: `-${border}`,
          height: `calc(var(--tabs-top) + ${border})`,
          '-webkit-app-region': 'no-drag',
        },
        before,
      );
      looks(tab, { position: 'relative' });
    }
    const [, small] = allWithClass(
      rendered(<TabBarIn maximized={false} />),
      'tab',
    );
    looks(small, { content: undefined }, before);
    assert.match(
      cascaded(
        withClass(rendered(<TabBarIn maximized />), 'tabs'),
        'padding',
      ) ?? '',
      /^var\(--tabs-top\)\s/,
    );
  });

  test('keeps the tab row as tall with no repository open as with tabs in it, which their name or close button makes as tall as the taller, so it does not jump as the first opens', () => {
    const tab = allWithClass(rendered(<TabBarShown />), 'tab').find(
      (each) => !each.classes.includes('active'),
    );
    assert.ok(tab);
    const { top, bottom } = paddingOf(tab);
    const border = parseFloat(cascaded(tab, 'border') ?? '0');
    const gap = parseFloat(cascaded(tab, 'margin-bottom') ?? '0');
    const close = cascaded(withClass(tab, 'tab-close'), 'height');
    looks(withClass(rendered(<TabBarShown />), 'tab-list'), {
      'min-height': `calc(max(1lh, ${close}) + ${parseFloat(top) + parseFloat(bottom) + 2 * border + gap}px)`,
    });
  });

  test("leaves a straight run of the sheet's edge between its rounded corner and the curve out of its first tab, past the app's icon", () => {
    const { tabStart } = appIconSpacing(<TabBarShown />);
    const gutter = lengthOf('var(--gutter-width)');
    const corner = lengthOf('var(--radius)');
    const run = tabStart - gutter - 2 * corner;
    assert.ok(run >= gutter, String(run));
  });

  test("leaves as much room after the app's icon, up to the side of the first tab, as before it, from the edge of the window", () => {
    const { leading, trailing } = appIconSpacing(<TabBarShown />);
    assert.ok(leading > 0, String(leading));
    assert.strictEqual(trailing, leading);
  });

  test("draws the app's icon square, in a square button rounded like the cards, so it opens the menu and shows it is pressed or hovered like the tabs' other buttons", () => {
    const menu = withClass(rendered(<TabBarShown />), 'menu-button');
    const button = withClass(menu, 'nav-button');
    const icon = withClass(menu, 'title-bar-icon');
    assert.strictEqual(cascaded(icon, 'height'), cascaded(icon, 'width'));
    assert.strictEqual(cascaded(button, 'height'), cascaded(button, 'width'));
    assert.ok(
      lengthOf(cascaded(button, 'width')) > lengthOf(cascaded(icon, 'width')),
    );
    looks(button, { 'border-radius': 'var(--radius)' });
    assert.strictEqual(
      lengthOf(
        /inset 0 0 0\s+([^]*\S)\s+var\(--hover-background\)/.exec(
          cascaded(button, 'box-shadow', hovered) ?? '',
        )?.[1],
      ),
      lengthOf(cascaded(button, 'width')) / 2,
    );
  });

  test("centers the app's icon on the names of the tabs, its button's box as tall and as far above the sheet as a tab in the back", () => {
    const bar = rendered(<TabBarShown />);
    const tab = allWithClass(bar, 'tab').find(
      (each) => !each.classes.includes('active'),
    );
    assert.ok(tab);
    const { top, bottom } = paddingOf(tab);
    const border = parseFloat(cascaded(tab, 'border') ?? '0');
    const close = cascaded(withClass(tab, 'tab-close'), 'height');
    looks(withClass(bar, 'menu-button'), {
      'align-self': 'flex-end',
      'align-items': 'center',
      height: `calc(max(1lh, ${close}) + ${parseFloat(top) + parseFloat(bottom) + 2 * border}px)`,
      padding: undefined,
      'margin-bottom': cascaded(tab, 'margin-bottom'),
    });
  });

  test('shows the worktrees as grey chips rather than tabs, the active one in the selection color, with nothing joining it to the columns', () => {
    const bar = rendered(
      <WorktreeBarShown
        worktrees={[worktree('a'), worktree('b')]}
        active="/a"
      />,
    );
    const [active, other] = allWithClass(bar, 'tab');
    assert.ok(active.classes.includes('active'));
    for (const chip of [active, other]) {
      assert.match(cascaded(chip, 'border') ?? '', /^\S+ solid transparent$/);
      looks(chip, {
        'border-radius': 'var(--radius)',
        'margin-bottom': undefined,
      });
    }
    looks(active, { background: 'var(--selection-background)' });
    for (const pseudoElement of ['::before', '::after']) {
      looks(active, { content: undefined }, { pseudoElement });
    }
    looks(other, { background: 'var(--color-border)' });
    looks(
      withClass(
        rendered(
          <WorktreeBarShown
            worktrees={[{ ...worktree('a'), missing: true }, worktree('b')]}
          />,
        ),
        'tab',
      ),
      { background: 'var(--color-border)' },
      hovered,
    );
    looks(
      allWithClass(rendered(<TabBarShown />), 'tab').find(
        (tab) => !tab.classes.includes('active'),
      ),
      { background: 'transparent' },
    );
    looks(rendered(<Columns className={columnsClass(true, 'a')} />), {
      margin: undefined,
      border: undefined,
      background: undefined,
      'border-radius': undefined,
    });
  });

  test('makes every worktree chip as tall, the active one too, so the row keeps its height when another is opened', () => {
    const [active, ...others] = allWithClass(
      rendered(
        <WorktreeBarShown
          worktrees={[worktree('a'), worktree('b')]}
          active="/a"
        />,
      ),
      'tab',
    );
    assert.ok(active.classes.includes('active'));
    const height = cascaded(active, 'height');
    assert.ok(height);
    for (const tab of [active, ...others]) {
      looks(tab, { height, 'margin-bottom': undefined });
    }
  });

  test('pads the columns from the sheet by a gutter, sharing the one above them with the worktree row and keeping one gutter at the left edge when the commits are hidden, the gap after their empty column', () => {
    looks(rendered(<Columns className={columnsClass(true, 'a')} />), {
      padding: 'var(--gutter-width)',
      'padding-left': undefined,
      'margin-left': undefined,
      gap: 'var(--gutter-width)',
    });
    looks(rendered(<Columns className={columnsClass(false, 'a')} />), {
      'padding-left': '0',
    });
    looks(
      withClass(
        rendered(
          <WorktreeBarShown worktrees={[worktree('a'), worktree('b')]} />,
        ),
        'worktrees',
      ),
      {
        padding: 'var(--gutter-width) var(--gutter-width) 0',
      },
    );
  });

  test('shows the X of every repository tab at full strength, not only on the one open or hovered', () => {
    for (const tab of allWithClass(rendered(<TabBarShown />), 'tab')) {
      looks(withClass(tab, 'tab-close'), {
        opacity: undefined,
        visibility: undefined,
      });
    }
  });

  test('colors the icon of each tool with its own color from the settings, so tabs of different tools for one folder tell apart at a glance', () => {
    const bar = rendered(
      <ShellStore
        value={tabsStore(
          [
            { id: '1', tool: 'git', root: '/a', name: 'a' },
            { id: '2', tool: 'commander', root: '/a', name: 'a' },
            { id: '3', tool: 'terminal', root: '/a', name: 'a' },
          ],
          '1',
        )}
      >
        <TabBar />
      </ShellStore>,
    );
    assert.deepStrictEqual(
      allWithClass(bar, 'tool-icon').map((icon) => cascaded(icon, 'color')),
      [
        'var(--color-git-icon)',
        'var(--color-commander-icon)',
        'var(--color-terminal-icon)',
      ],
    );
    assert.strictEqual(
      cascaded(withClass(bar, 'floppy-label'), 'fill'),
      'var(--color-commander-icon-label)',
    );
    assert.strictEqual(
      cascaded(withClass(bar, 'floppy-lines'), 'fill'),
      'var(--color-commander-icon-accent)',
    );
    assert.strictEqual(
      cascaded(withClass(bar, 'terminal-icon-screen'), 'fill'),
      'var(--color-terminal-icon-screen)',
    );
    assert.strictEqual(
      cascaded(withClass(bar, 'terminal-icon-prompt'), 'fill'),
      'var(--color-terminal-icon-accent)',
    );
  });
});
