import * as assert from 'node:assert';
import { createElement } from 'react';
import { suite, test } from 'vitest';
import { columnsClass } from '../../../tools/git/page/columns';
import { TabBar } from '../../../shell/page/tabBar';
import {
  allWithClass,
  cascaded,
  rendered,
  withClass,
  type MarkupElement,
  type States,
} from '../../support/cascade';
import {
  columns,
  menuButton,
  tabBar,
  worktree,
  worktreeBar,
} from '../../support/styleFixtures';
import { createShellStore, ShellStore } from '../../../shell/page/store';
import {
  keyframe,
  noop,
  looks,
  bodyVariable,
  lengthOf,
  appIconSpacing,
  paddingOf,
  halved,
  layer,
  hovered,
  after,
  tabStrip,
  tabBarIn,
  tabRow,
  divider,
} from './stylesheetFixtures';

const shown = (tab: MarkupElement, states?: States) =>
  cascaded(divider(tab), 'visibility', states) !== 'hidden';

suite('Style', () => {
  test('grows an opened tab from nothing and shrinks a closed one to nothing, its gap with it, as Chrome does, clipping what does not fit yet', () => {
    const bar = rendered(
      createElement(
        'nav',
        { className: 'tabs' },
        createElement('div', { className: 'tab active opening' }),
        createElement('div', { className: 'tab closing' }),
      ),
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
      'margin-right: calc(-1 * var(--card-radius));',
    ]) {
      assert.ok(gone.includes(declaration), declaration);
    }
  });

  test('keeps the repository tabs on one row, shrinking them as Chrome does rather than wrapping them, down to a letter or two of the name beside the close button', () => {
    looks(withClass(tabBar(), 'tab-list'), {
      'flex-wrap': 'nowrap',
      overflow: undefined,
      'overflow-x': undefined,
    });
    looks(withClass(tabBar(), 'tab-strip'), {
      display: 'flex',
      'flex-wrap': undefined,
      'align-items': 'flex-end',
      'flex-shrink': '1',
      'min-width': '0',
    });
    const [active, other] = allWithClass(tabBar(), 'tab');
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
      'min-width': `calc(${icon} + ${name} + 2 * ${gap} + ${frame})`,
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
      withClass(tabBar(), 'tab-add'),
    ]) {
      looks(button, { flex: 'none' });
    }
  });

  test('makes every repository tab as wide as a tab in Chrome, however short or long its name, with its close button at its right edge, sharing the room out alike once they no longer fit, so a short name is not cut down sooner than a long one', () => {
    for (const tab of allWithClass(tabBar(), 'tab')) {
      looks(tab, {
        flex: undefined,
        'flex-grow': undefined,
        'flex-basis': undefined,
        'flex-shrink': '1',
        'box-sizing': 'border-box',
        width: '240px',
        'max-width': undefined,
      });
      looks(withClass(tab, 'tab-close'), { 'margin-left': 'auto' });
    }
  });

  test("rounds the repository tabs as Chrome does, rounder than the sheet's corners and the worktree chips", () => {
    assert.strictEqual(bodyVariable('tab-radius'), '10px');
    assert.ok(
      parseFloat(bodyVariable('tab-radius') ?? '0') >
        parseFloat(bodyVariable('card-radius') ?? '0'),
    );
    const [active, other] = allWithClass(tabBar(), 'tab');
    looks(other, { 'border-radius': 'var(--tab-radius)' });
    looks(active, {
      'border-radius': 'var(--tab-radius) var(--tab-radius) 0 0',
    });
  });

  test('gives up the close button of a tab not open, as Chrome does, only once its name is down to its first letters, then wholly, as flexbox shrinks items whose factors add up to less than one only partly', () => {
    const [, other] = allWithClass(tabBar(), 'tab');
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
    const [, tab] = allWithClass(tabBar(), 'tab');
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

  test('scrolls the repository tabs sideways without a scrollbar once even their narrowest is too wide, as Chrome does, scrolled by the wheel alone so it gets no overlay scrollbar over the tabs, leaving room inside its edges for the open tab to curve out, join its sheet and, in a maximized window, for a tab to reach up, so none of that is cut off, nor slides under the logo or the button beside', () => {
    const [active, other] = allWithClass(tabBarIn(true), 'tab');
    const curve = cascaded(active, 'width', { pseudoElement: '::before' });
    const reach = cascaded(other, 'height', { pseudoElement: '::before' });
    const join = cascaded(active, 'margin-bottom');
    for (const maximized of [false, true]) {
      looks(tabStrip(maximized, true), {
        'overflow-x': 'hidden',
        'padding-left': curve,
        'padding-right': curve,
        'margin-left': undefined,
        'margin-right': undefined,
        'padding-top': maximized ? reach : undefined,
        'margin-top': maximized ? `calc(-1 * ${reach})` : undefined,
        'padding-bottom': join?.replace(/^-/, ''),
        'margin-bottom': join,
      });
    }
  });

  test('leaves room beside the repository tabs to drag the window by, however many are open', () => {
    const list = withClass(tabBar(), 'tab-list');
    looks(list, { '-webkit-app-region': undefined });
    assert.ok(parseFloat(cascaded(list, 'padding-right') ?? '0') >= 32);
  });

  test('wraps the worktrees onto more rows rather than scrolling them sideways', () => {
    looks(withClass(worktreeBar([worktree('a'), worktree('b')]), 'tab-list'), {
      'flex-wrap': 'wrap',
      overflow: undefined,
      'overflow-x': undefined,
    });
  });

  test('joins the active repository tab to the white sheet under it, which holds the worktrees and the columns', () => {
    const tab = withClass(tabBar(), 'tab', 'active');
    looks(tab, {
      '--sheet': 'var(--repository-background)',
      background: 'var(--sheet)',
      'border-radius': 'var(--tab-radius) var(--tab-radius) 0 0',
    });
    for (const pseudoElement of ['::before', '::after']) {
      assert.match(
        cascaded(tab, 'box-shadow', { pseudoElement }) ?? '',
        /var\(--sheet\)$/,
      );
    }
    assert.strictEqual(
      bodyVariable('repository-background'),
      'var(--color-panel-background)',
    );
    looks(
      withClass(
        rendered(createElement('div', { className: 'repository' })),
        'repository',
      ),
      { background: 'var(--repository-background)' },
    );
  });

  test('curves the active repository tab out into its sheet, white on white without an outline', () => {
    const tab = withClass(tabBar(), 'tab', 'active');
    assert.match(cascaded(tab, 'border') ?? '', /^\S+ solid transparent$/);
    const [border] = (cascaded(tab, 'border') ?? '').split(' ');
    looks(tab, {
      'border-bottom-color': undefined,
      'margin-bottom': `-${border}`,
    });
    const size = 'calc(2 * var(--tab-radius))';
    const corner = 'var(--tab-radius)';
    looks(
      tab,
      {
        right: `calc(100% + ${border})`,
        bottom: '0',
        width: size,
        height: size,
        'border-right': undefined,
        'border-bottom': undefined,
        'border-bottom-right-radius': corner,
        'box-shadow': `${corner} ${corner} 0 0 var(--sheet)`,
        'clip-path': `inset(${corner} -${border} -${border} ${corner})`,
      },
      { pseudoElement: '::before' },
    );
    looks(
      tab,
      {
        left: `calc(100% + ${border})`,
        bottom: '0',
        width: size,
        height: size,
        'border-left': undefined,
        'border-bottom': undefined,
        'border-bottom-left-radius': corner,
        'box-shadow': `calc(-1 * ${corner}) ${corner} 0 0 var(--sheet)`,
        'clip-path': `inset(${corner} ${corner} -${border} -${border})`,
      },
      { pseudoElement: '::after' },
    );
    looks(
      withClass(
        rendered(createElement('div', { className: 'repository' })),
        'repository',
      ),
      { border: undefined },
    );
    assert.strictEqual(bodyVariable('sheet-border'), undefined);
  });

  test('keeps the name of a repository tab where it was once the tab is opened, though the tab reaches a pixel further down into its sheet', () => {
    const [active, other] = allWithClass(tabBar(), 'tab');
    assert.ok(active.classes.includes('active'));
    const reach = -parseFloat(cascaded(active, 'margin-bottom') ?? '0');
    assert.strictEqual(reach, 1);
    assert.strictEqual(paddingOf(active).top, paddingOf(other).top);
    assert.strictEqual(
      parseFloat(
        cascaded(active, 'padding-bottom') ?? paddingOf(active).bottom,
      ) - parseFloat(paddingOf(other).bottom),
      reach + parseFloat(cascaded(other, 'margin-bottom') ?? '0'),
    );
  });

  test('highlights a repository tab not open on hover as a pill stopping short of the sheet, as Chrome does, its name and close button in the middle of it, still picking the tab from the gap under it', () => {
    const other = allWithClass(tabBar(), 'tab').find(
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
    const [a, b, c] = allWithClass(tabRow(3, '/b'), 'tab');
    const width = cascaded(divider(a), 'width');
    const [border] = (cascaded(a, 'border') ?? '').split(' ');
    const gap = parseFloat(bodyVariable('card-radius') ?? '');
    looks(divider(a), {
      position: 'absolute',
      top: '50%',
      right: `${-(parseFloat(border) + gap / 2 + parseFloat(width ?? '') / 2)}px`,
      width: '2px',
      height: '16px',
      'border-radius': halved(width),
      background: 'var(--tab-divider)',
      transform: 'translateY(-50%)',
      'pointer-events': 'none',
    });
    assert.strictEqual(
      cascaded(withClass(tabRow(3, '/b'), 'tab-strip'), 'gap'),
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
    const [first, second, third] = allWithClass(tabRow(3, '/a'), 'tab');
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
    const [lone] = allWithClass(tabRow(1, '/a'), 'tab');
    looks(lone, { '-webkit-app-region': 'drag' });
    looks(withClass(lone, 'tab-close'), { '-webkit-app-region': 'no-drag' });
    for (const tab of allWithClass(tabRow(2, '/a'), 'tab')) {
      looks(tab, { '-webkit-app-region': 'no-drag' });
    }
  });

  test('leaves a lone tab to the app while another window could take it, as dragging it then moves its window into that one rather than letting the system move the window', () => {
    const [lone] = allWithClass(
      rendered(
        createElement(
          ShellStore,
          {
            value: createShellStore(noop, {
              tabs: [{ id: '/a', tool: 'git', root: '/a', name: 'a' }],
              active: '/a',
              tearsOff: true,
              windows: [{ id: '2', name: 'b' }],
            }),
          },
          createElement(TabBar, {}),
        ),
      ),
      'tab',
    );
    looks(lone, { '-webkit-app-region': 'no-drag' });
  });

  test('keeps a repository tab dragged over the others and right under the pointer, while the others slide into their places', () => {
    const row = rendered(
      createElement(
        'nav',
        { className: 'tabs' },
        createElement('div', { className: 'tab active dragging' }),
        createElement('div', { className: 'tab' }),
      ),
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

  test('makes the button opening a repository round like the buttons beside it', () => {
    const add = withClass(tabBar(), 'tab-add');
    const beside = withClass(rendered(menuButton()), 'nav-button');
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

  test('reaches each tab not open up to the top of a maximized window, so the pointer flung there highlights and picks it, but not while the window is smaller', () => {
    const before = { pseudoElement: '::before' };
    const [active, other] = allWithClass(tabBarIn(true), 'tab');
    const [border] = (cascaded(other, 'border') ?? '').split(' ');
    const reach = `calc(var(--tabs-top) + ${border})`;
    looks(
      other,
      {
        content: "''",
        position: 'absolute',
        bottom: '100%',
        left: `-${border}`,
        right: `-${border}`,
        height: reach,
        '-webkit-app-region': 'no-drag',
      },
      before,
    );
    looks(other, { position: 'relative' });
    assert.notStrictEqual(cascaded(active, 'height', before), reach);
    const [, small] = allWithClass(tabBarIn(false), 'tab');
    looks(small, { content: undefined }, before);
    assert.match(
      cascaded(withClass(tabBarIn(true), 'tabs'), 'padding') ?? '',
      /^var\(--tabs-top\)\s/,
    );
  });

  test('keeps the tab row as tall with no repository open as with tabs in it, which their name or close button makes as tall as the taller, so it does not jump as the first opens', () => {
    const tab = allWithClass(tabBar(), 'tab').find(
      (each) => !each.classes.includes('active'),
    );
    assert.ok(tab);
    const { top, bottom } = paddingOf(tab);
    const border = parseFloat(cascaded(tab, 'border') ?? '0');
    const gap = parseFloat(cascaded(tab, 'margin-bottom') ?? '0');
    const close = cascaded(withClass(tab, 'tab-close'), 'height');
    looks(withClass(tabBar(), 'tab-list'), {
      'min-height': `calc(max(1lh, ${close}) + ${parseFloat(top) + parseFloat(bottom) + 2 * border + gap}px)`,
    });
  });

  test("leaves a straight run of the sheet's edge between its rounded corner and the curve out of its first tab, past the app's icon", () => {
    const { tabStart } = appIconSpacing();
    const gutter = lengthOf('var(--gutter-width)');
    const corner = lengthOf('var(--card-radius)');
    const curve = lengthOf('var(--tab-radius)');
    const run = tabStart - gutter - corner - curve;
    assert.ok(run >= gutter, String(run));
  });

  test("leaves as much room after the app's icon, up to the side of the first tab, as before it, from the edge of the window", () => {
    const { leading, trailing } = appIconSpacing();
    assert.ok(leading > 0, String(leading));
    assert.strictEqual(trailing, leading);
  });

  test("draws the app's icon square, in a square button rounded like the cards, so it opens the menu and shows it is pressed or hovered like the tabs' other buttons", () => {
    const menu = withClass(tabBar(), 'menu-button');
    const button = withClass(menu, 'nav-button');
    const icon = withClass(menu, 'title-bar-icon');
    assert.strictEqual(cascaded(icon, 'height'), cascaded(icon, 'width'));
    assert.strictEqual(cascaded(button, 'height'), cascaded(button, 'width'));
    assert.ok(
      lengthOf(cascaded(button, 'width')) > lengthOf(cascaded(icon, 'width')),
    );
    looks(button, { 'border-radius': 'var(--card-radius)' });
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
    const bar = tabBar();
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
      padding: '0',
      'margin-bottom': cascaded(tab, 'margin-bottom'),
    });
  });

  test('shows the worktrees as grey chips rather than tabs, the active one in the selection color, with nothing joining it to the columns', () => {
    const bar = worktreeBar([worktree('a'), worktree('b')], '/a');
    const [active, other] = allWithClass(bar, 'tab');
    assert.ok(active.classes.includes('active'));
    for (const chip of [active, other]) {
      assert.match(cascaded(chip, 'border') ?? '', /^\S+ solid transparent$/);
      looks(chip, {
        'border-radius': 'var(--card-radius)',
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
        worktreeBar([{ ...worktree('a'), missing: true }, worktree('b')]),
        'tab',
      ),
      { background: 'var(--color-border)' },
      hovered,
    );
    looks(
      allWithClass(tabBar(), 'tab').find(
        (tab) => !tab.classes.includes('active'),
      ),
      { background: 'transparent' },
    );
    looks(columns(columnsClass(true, 'a')), {
      margin: undefined,
      border: undefined,
      background: undefined,
      'border-radius': undefined,
    });
  });

  test('makes every worktree chip as tall, the active one too, so the row keeps its height when another is opened', () => {
    const [active, ...others] = allWithClass(
      worktreeBar([worktree('a'), worktree('b')], '/a'),
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
    looks(columns(columnsClass(true, 'a')), {
      padding: 'var(--gutter-width)',
      'padding-left': undefined,
      'margin-left': undefined,
      gap: 'var(--gutter-width)',
    });
    looks(columns(columnsClass(false, 'a')), { 'padding-left': '0' });
    looks(withClass(worktreeBar([worktree('a'), worktree('b')]), 'worktrees'), {
      padding: 'var(--gutter-width) var(--gutter-width) 0',
    });
  });

  test('shows the X of every repository tab at full strength, not only on the one open or hovered', () => {
    for (const tab of allWithClass(tabBar(), 'tab')) {
      looks(withClass(tab, 'tab-close'), {
        opacity: undefined,
        visibility: undefined,
      });
    }
  });
});
