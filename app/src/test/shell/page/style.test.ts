import * as assert from 'node:assert';
import { createElement } from 'react';
import { suite, test } from 'vitest';
import {
  columnFocusAttribute,
  type ColumnName,
} from '../../../tools/git/page/activeColumn';
import {
  BranchActions,
  BubbleActions,
  CheckedOutBranch,
  RefBubble,
  TagActions,
} from '../../../tools/git/page/bubbles';
import { GraphCell } from '../../../tools/git/page/graph';
import { listedFilesRows } from '../../../tools/git/page/changesTree';
import { Column } from '../../../tools/git/page/column';
import { columnsClass } from '../../../tools/git/page/columns';
import {
  bubbleLineHeight,
  commitRowHeight,
  SoloButton,
  workingTreeRowHeight,
} from '../../../tools/git/page/commitList';
import {
  FileNote,
  diffRowClass,
  FileHeader,
  HunkDivider,
  layoutVariables,
  rowHeight,
} from '../../../tools/git/page/diffView';
import { ImageDiff } from '../../../tools/git/page/imagePreview';
import { MarkdownDiff } from '../../../tools/git/page/markdownPreview';
import { AboutPopup, CopyButton } from '../../../shell/page/aboutPopup';
import { TabBar } from '../../../shell/page/tabBar';
import { ContextMenu } from '../../../ui/contextMenu';
import { Crash } from '../../../shell/page/errorBoundary';
import { overlayScrollbarClass } from '../../../ui/overlayScrollbars';
import {
  codePadding,
  markerWidth,
  numberWidth,
} from '../../../tools/git/page/overflow';
import { shortcutGroupsFor } from '../../../shell/page/App';
import { ShortcutsPopup } from '../../../shell/page/shortcutsPopup';
import { SkeletonRows } from '../../../ui/skeleton';
import { VirtualRows } from '../../../tools/git/page/virtualRows';
import { tabSize } from '../../../ui/wordWrap';
import {
  allWithClass,
  cascaded,
  matchingRules,
  rendered,
  withClass,
  type MarkupElement,
  type States,
} from '../../cascade';
import { fileChange, renderedBy, stylesheet } from '../../fixtures';
import {
  searchButton,
  bubbles,
  columns,
  columnTitle,
  commitRow,
  contextMenu,
  diffFind,
  diffOptions,
  diffRow,
  diffView,
  fileRow,
  folderRow,
  historyMenu,
  indentedLine,
  inlineLine,
  locationsPopup,
  messagePanel,
  minimap,
  menuButton,
  navButtons,
  notices,
  repository,
  shownRow,
  splitLine,
  tabBar,
  workingTreeRow,
  worktree,
  worktreeBar,
} from '../../styleFixtures';

const css = stylesheet();

const noop = () => undefined;

function buttonsWidth(count: number, side: 'left' | 'right' = 'left'): number {
  const title = columnTitle(navButtons());
  const actions = rendered(
    createElement('div', { className: 'column-actions' }),
  );
  const [edge, gap] =
    side === 'left'
      ? [
          cascaded(withClass(title, 'column-start'), 'left'),
          cascaded(withClass(title, 'nav-buttons'), 'gap'),
        ]
      : [cascaded(actions, 'right'), cascaded(actions, 'gap')];
  const button = cascaded(withClass(title, 'nav-button'), 'width');
  const clearance = paddingOf(columnTitle(null))[side];
  return (
    parseFloat(edge ?? '') +
    count * parseFloat(button ?? '') +
    (count - 1) * parseFloat(gap ?? '') +
    parseFloat(clearance)
  );
}

function activeEdge(): string {
  const edge = withClass(columns(columnsClass(true, 'a'), 'commits'), 'column');
  const [, width = ''] =
    /^inset 0 0 0 (\S+) var\(--color-focus\)$/.exec(
      cascaded(edge, 'box-shadow', after) ?? '',
    ) ?? [];
  return width;
}

function indented(wordWrap: boolean): MarkupElement {
  return shownRow(diffView({ wordWrap }, indentedLine()));
}

function pixels(value: string | undefined): number {
  const match = /^calc\((.*)\)$/.exec(value ?? '');
  assert.ok(match, value);
  return match[1]
    .split('+')
    .map((term) =>
      term
        .split('*')
        .map((factor) => parseFloat(factor))
        .reduce((product, factor) => product * factor, 1),
    )
    .reduce((sum, term) => sum + term, 0);
}

const compact = (value: string | undefined) =>
  value?.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');

function looks(
  element: MarkupElement | undefined,
  expected: Readonly<Record<string, string | undefined>>,
  states?: States,
): void {
  assert.ok(element);
  assert.deepStrictEqual(
    Object.fromEntries(
      Object.keys(expected).map((property) => [
        property,
        cascaded(element, property, states),
      ]),
    ),
    expected,
    element.classes.join(' '),
  );
}

function looksAlike(
  element: MarkupElement,
  properties: readonly string[],
  states: States,
  other: States = {},
): void {
  looks(
    element,
    Object.fromEntries(
      properties.map((property) => [
        property,
        cascaded(element, property, other),
      ]),
    ),
    states,
  );
}

const body = rendered(createElement('body'));

function bodyVariable(name: string): string | undefined {
  return cascaded(body, `--${name}`);
}

function sidesOf(element: MarkupElement, property: string) {
  const values = [''];
  let depth = 0;
  for (const char of cascaded(element, property) ?? '0') {
    depth += Number(char === '(') - Number(char === ')');
    if (depth === 0 && char === ' ') {
      values.push('');
    } else {
      values[values.length - 1] += char;
    }
  }
  const [top, right = top, bottom = top, left = right] = values;
  return { top, right, bottom, left };
}

function paddingOf(element: MarkupElement) {
  return sidesOf(element, 'padding');
}

function halved(length: string | undefined): string {
  return `${parseFloat(length ?? '') / 2}px`;
}

function layer(element: MarkupElement, states?: States): number {
  return Number(cascaded(element, 'z-index', states));
}

const hovered = { hover: true } as const;
const focused = { focus: true } as const;
const after = { pseudoElement: '::after' };

function commitColumnTitle(autoFetchMinutes: number): MarkupElement {
  return columnTitle(navButtons({ autoFetchMinutes }));
}

function aboutPopup(): MarkupElement {
  return withClass(
    rendered(
      createElement(AboutPopup, {
        about: {
          version: '1.0.0',
          development: false,
          git: '2.52.0',
          system: 'Linux 6.8.0, x64',
        },
        onCopy: noop,
        onClose: noop,
      }),
    ),
    'shortcuts-popup',
  );
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

function tabBarIn(maximized: boolean): MarkupElement {
  return rendered(
    createElement(
      'div',
      maximized ? { 'data-maximized': '' } : {},
      createElement(TabBar, {
        tabs: [
          { id: '/a', tool: 'git', root: '/a', name: 'a' },
          { id: '/b', tool: 'git', root: '/b', name: 'b' },
        ],
        active: '/a',
        onSelect: noop,
        onPreload: noop,
        onClose: noop,
        onAdd: noop,
        onLog: noop,
      }),
    ),
  );
}

function tabRow(count: number, active: string): MarkupElement {
  return rendered(
    createElement(TabBar, {
      tabs: ['a', 'b', 'c'].slice(0, count).map((name) => ({
        id: `/${name}`,
        tool: 'git' as const,
        root: `/${name}`,
        name,
      })),
      active,
      onSelect: noop,
      onPreload: noop,
      onClose: noop,
      onMove: noop,
      onAdd: noop,
      onLog: noop,
    }),
  );
}

function divider(tab: MarkupElement): MarkupElement {
  return withClass(tab, 'tab-divider');
}

function shortcutsPopup(): MarkupElement {
  return withClass(
    rendered(
      createElement(ShortcutsPopup, {
        groups: shortcutGroupsFor('git'),
        mac: false,
        onClose: noop,
      }),
    ),
    'shortcuts-popup',
  );
}

function overlayScrollbar(classes = ''): MarkupElement {
  return rendered(
    createElement('div', {
      className: `${overlayScrollbarClass} vertical ${classes}`,
    }),
  );
}

function keyOf(element: MarkupElement): MarkupElement | undefined {
  return element.tag === 'kbd'
    ? element
    : element.children.map(keyOf).find((key) => key !== undefined);
}

function shownScrollbar(message?: string): MarkupElement {
  return withClass(
    rendered(
      createElement(
        'body',
        null,
        message !== undefined && createElement('div', { className: message }),
        createElement('div', {
          className: `${overlayScrollbarClass} vertical shown`,
        }),
      ),
    ),
    overlayScrollbarClass,
  );
}

function skeletonRow(className?: string): MarkupElement {
  return withClass(
    rendered(createElement(SkeletonRows, { count: 1, className })),
    'skeleton-row',
  );
}

function soloButton(solo: boolean, applying: boolean): MarkupElement {
  return rendered(createElement(SoloButton, { solo, applying, onSolo: noop }));
}

function frameAndLine(row: MarkupElement): { frame: number; line: number } {
  const padding = /^(\d+)px \d+px (\d+)px$/.exec(
    cascaded(row, 'padding') ?? '',
  );
  assert.ok(padding);
  const border = /^(\d+)px /.exec(cascaded(row, 'border-bottom') ?? '');
  assert.ok(border);
  const height = /^(\d+)px$/.exec(
    cascaded(withClass(row, 'commit-line'), 'height') ?? '',
  );
  assert.ok(height);
  return {
    frame: Number(padding[1]) + Number(padding[2]) + Number(border[1]),
    line: Number(height[1]),
  };
}

function badgeRules(node: React.ReactNode): string[] {
  return matchingRules(withClass(rendered(node), 'badge')).map(
    (rule) => rule.selector,
  );
}

function hunkDots(sideBySide: boolean): MarkupElement {
  return withClass(
    diffView({ sideBySide }, diffRow(createElement(HunkDivider))),
    'hunk-dots',
  );
}

const fileHeader = diffRow(
  createElement(FileHeader, {
    path: 'a',
    open: true,
    whole: false,
    collapsible: true,
    onClick: noop,
  }),
);

function columnVisibility(selected: string | undefined, diffShown = true) {
  return allWithClass(
    columns(columnsClass(true, selected, diffShown)),
    'column',
  ).map((column) => cascaded(column, 'visibility'));
}

function unwrapped(value: string | undefined): string {
  return (value ?? '')
    .replaceAll(/\(\s+/g, '(')
    .replaceAll(/\s+\)/g, ')')
    .replaceAll(/\s+/g, ' ');
}

const bubbleLook = ['color', 'background', 'box-shadow', 'border'];

function branchBubble(): MarkupElement {
  const branch = bubbles().find(
    (bubble) =>
      bubble.classes.includes('branch') &&
      !bubble.classes.includes('checked-out'),
  );
  assert.ok(branch);
  return branch;
}

function widthCap(popup: MarkupElement): { cap: number; room: string } {
  const width = /^min\(([\d.]+)px, (.+)\)$/.exec(
    cascaded(popup, 'width') ?? '',
  );
  assert.ok(width);
  return { cap: Number(width[1]), room: width[2] };
}

function tagHoleReach(tag: MarkupElement): number {
  const hole =
    /^radial-gradient\(circle at calc\(100% - ([\d.]+)px\) 50%, transparent [\d.]+px, var\(--color-bubble\) ([\d.]+)px\)$/.exec(
      unwrapped(cascaded(tag, 'background')),
    );
  assert.ok(hole);
  return Number(hole[1]) + Number(hole[2]);
}

suite('Style', () => {
  test("keeps the commit column's title clear of its buttons and the gaps between them", () => {
    const title = commitColumnTitle(0);
    assert.strictEqual(
      pixels(cascaded(title, 'padding-left')),
      buttonsWidth(4),
    );
    assert.strictEqual(
      pixels(cascaded(title, 'padding-right')),
      buttonsWidth(2, 'right'),
    );
    assert.strictEqual(
      pixels(cascaded(commitColumnTitle(5), 'padding-left')),
      buttonsWidth(5),
    );
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
    const shown = (tab: MarkupElement, states?: States) =>
      cascaded(divider(tab), 'visibility', states) !== 'hidden';
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
    const resolved = (value: string | undefined) =>
      (value ?? '').replace(
        /var\(--([\w-]+)\)/g,
        (_, name: string) => bodyVariable(name) ?? '',
      );
    const gutter = parseFloat(resolved('var(--gutter-width)'));
    const corner = parseFloat(resolved('var(--card-radius)'));
    const curve = parseFloat(resolved('var(--tab-radius)'));
    const bar = tabBar();
    const icon = parseFloat(
      cascaded(withClass(bar, 'title-bar-icon'), 'width') ?? '',
    );
    const gap = parseFloat(cascaded(withClass(bar, 'tabs'), 'gap') ?? '');
    const run =
      pixels(resolved(bodyVariable('tab-inset'))) +
      icon +
      gap -
      gutter -
      corner -
      curve;
    assert.ok(run >= gutter, String(run));
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

  test('shades a round button on hover over whatever fill it has, so an active toggle or a pinned pair changes too', () => {
    const pinned = rendered(
      navButtons({ autoFetch: true, autoFetchMinutes: 5 }),
    );
    const enabled = [
      pinned,
      rendered(diffOptions({ ignoreWhitespace: false })),
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
      const radius = halved(cascaded(button, 'width'));
      looks(button, { 'border-radius': radius });
      looks(
        button,
        { 'box-shadow': `inset 0 0 0 ${radius} var(--hover-background)` },
        hovered,
      );
    }
    for (const button of filled) {
      looksAlike(button, ['background'], hovered);
    }
    looksAlike(withClass(pinned, 'pin-pair'), ['background'], {
      hover: filled[0],
    });
    const disabled = withClass(pinned, 'nav-button');
    assert.ok(disabled.attributes.has('disabled'));
    looks(disabled, { 'box-shadow': undefined }, hovered);
  });

  test('places the hidden-change markers by the line numbers, padding and marker width the diff draws', () => {
    const row = shownRow(diffView({}, inlineLine('added', { marker: true })));
    looks(withClass(row, 'number'), { width: 'var(--diff-number-width)' });
    looks(withClass(row, 'code'), { padding: '0 var(--diff-code-padding)' });
    looks(withClass(row, 'hidden-change'), {
      width: 'var(--diff-marker-width)',
    });
    assert.deepStrictEqual(
      [
        layoutVariables['--diff-number-width'],
        layoutVariables['--diff-code-padding'],
        layoutVariables['--diff-marker-width'],
      ],
      [`${numberWidth}px`, `${codePadding}px`, `${markerWidth}px`],
    );
  });

  test('widens every row of an inline diff to its widest line and past it by the minimap, so short lines stay tinted, the strips between files and hunks reach across when scrolled sideways, and the widest line ends before the minimap', () => {
    const rows = allWithClass(
      diffView(
        {},
        fileHeader,
        diffRow(createElement(HunkDivider)),
        inlineLine('added'),
      ),
      'virtual-row',
      'diff-row',
    );
    assert.strictEqual(rows.length, 3);
    for (const row of rows) {
      looks(row, {
        'min-width':
          'max(100%, var(--diff-content-width, 0px) + var(--minimap-width))',
        width: 'max-content',
      });
    }
  });

  test('tints a binary file added or deleted like such a line, and hatches the side it lacks like one, both halves as tall as the row', () => {
    for (const change of ['added', 'removed'] as const) {
      assert.strictEqual(
        cascaded(
          withClass(
            rendered(
              createElement(FileNote, {
                text: 'Binary file',
                change,
                split: false,
              }),
            ),
            'file-note',
          ),
          'background',
        ),
        cascaded(
          withClass(diffView({}, inlineLine(change)), 'diff-line', change),
          'background',
        ),
      );
    }
    const split = rendered(
      createElement(FileNote, {
        text: 'Binary file',
        change: 'added',
        split: true,
      }),
    );
    assert.strictEqual(
      cascaded(withClass(split, 'filler'), 'background'),
      cascaded(
        withClass(
          diffView({ sideBySide: true }, splitLine('filler', 'added')),
          'filler',
        ),
        'background',
      ),
    );
    for (const side of allWithClass(split, 'file-note')) {
      looks(side, { height: '100%' });
    }
    looks(withClass(split, 'split-line'), { height: '100%' });
  });

  test('lays an error over the diff out as wide as the view, so a long one wraps rather than running past what can be scrolled to', () => {
    for (const sideBySide of [false, true]) {
      const view = diffView(
        { sideBySide },
        createElement(
          'div',
          { className: diffRowClass('error') },
          createElement('div', { className: 'error-message' }, 'fatal: x'),
        ),
      );
      looks(withClass(view, 'virtual-row', 'error-row'), {
        'min-width': '0',
        width: '100%',
      });
    }
  });

  test('keeps the line breaks of an error git wrote over several lines, wrapping a long one anywhere', () => {
    looks(
      withClass(
        rendered(
          createElement(Crash, {
            title: 'Fastforward',
            error: new Error('boom'),
            onReload: noop,
          }),
        ),
        'error-message',
      ),
      { 'white-space': 'pre-wrap', 'overflow-wrap': 'anywhere' },
    );
  });

  test('previews Markdown as wide as the diff, in halves side by side parted by the line that parts the sides of the diff, hatching the half a file lacks', () => {
    const view = diffView(
      { sideBySide: true },
      createElement(
        'div',
        { className: diffRowClass('markdown') },
        createElement(MarkdownDiff, {
          sides: [
            { side: 'old', text: undefined, present: false },
            { side: 'new', text: undefined, present: true },
          ],
        }),
      ),
    );
    looks(withClass(view, 'virtual-row', 'preview-row'), {
      'min-width': '0',
      width: '100%',
    });
    looks(withClass(view, 'markdown-diff'), {
      display: 'flex',
      width: '100%',
      'margin-left': 'var(--visible-left, 0px)',
    });
    const [filler, pane] = allWithClass(view, 'markdown-pane');
    for (const half of [filler, pane]) {
      looks(half, { flex: '1 1 0', 'min-width': '0' });
    }
    assert.ok(filler.classes.includes('filler'));
    assert.strictEqual(
      cascaded(filler, 'background'),
      cascaded(
        withClass(
          diffView({ sideBySide: true }, splitLine('filler', 'added')),
          'filler',
        ),
        'background',
      ),
    );
    looks(pane, {
      'border-left': `${cascaded(view, 'width', after)} solid ${cascaded(view, 'background', after)}`,
    });
    const links = rendered(
      createElement(
        'div',
        { className: 'markdown' },
        createElement('a', { href: 'https://example.com' }, 'web'),
        createElement('a', {}, 'relative'),
      ),
    ).children;
    looks(links[0], { color: 'var(--color-focus)' });
    looks(links[1], { color: undefined });
    const keyword = rendered(
      createElement(
        'div',
        { className: 'markdown' },
        createElement('span', { className: 'syntax-keyword' }, 'const'),
      ),
    ).children[0];
    assert.strictEqual(
      cascaded(keyword, 'color'),
      'var(--color-syntax-keyword)',
    );
  });

  test('keeps an image row as wide as the diff, its images in the part scrolled to, side by side and short of the minimap, hatching a side it lacks down to where an image could reach', () => {
    const view = diffView(
      {},
      createElement(
        'div',
        { className: diffRowClass('image') },
        createElement(ImageDiff, {
          panes: [
            { side: 'old', url: undefined },
            { side: 'new', url: 'a.png' },
          ],
        }),
      ),
    );
    looks(withClass(view, 'virtual-row', 'preview-row'), {
      'min-width': '0',
      width: '100%',
    });
    looks(withClass(view, 'image-diff'), {
      display: 'flex',
      height: '100%',
      width: '100%',
      'margin-left': 'var(--visible-left, 0px)',
    });
    const panes = allWithClass(view, 'image-pane');
    for (const pane of panes) {
      looks(pane, {
        flex: '0 0 50%',
        'box-sizing': 'border-box',
        'min-width': '0',
      });
    }
    assert.strictEqual(diffRowClass('line').includes('preview-row'), false);
    const filler = withClass(view, 'image-pane', 'filler');
    const frame = withClass(filler, 'image-frame');
    looks(frame, {
      flex: '1',
      'align-self': 'stretch',
      'margin-right': undefined,
      'padding-right': undefined,
    });
    assert.strictEqual(
      cascaded(frame, 'background'),
      cascaded(
        withClass(
          diffView({ sideBySide: true }, splitLine('filler', 'added')),
          'filler',
        ),
        'background',
      ),
    );
  });

  test("opens the search over the commit column's title without moving its field or back button", () => {
    const title = commitColumnTitle(0);
    assert.strictEqual(cascaded(title, 'height'), 'var(--title-height)');
    const border = cascaded(title, 'border-bottom');
    const [line] = (border ?? '').split(' ');
    assert.strictEqual(
      cascaded(withClass(locationsPopup(''), 'locations-groups'), 'border-top'),
      border,
    );
    const edge = cascaded(withClass(title, 'column-start'), 'left');
    assert.match(edge ?? '', /^\d+px$/);
    looks(withClass(locationsPopup(''), 'locations-search-row'), {
      height: `calc(var(--title-height) - ${line})`,
      'box-sizing': 'border-box',
      margin: undefined,
      'margin-top': undefined,
      'margin-bottom': undefined,
      padding: `0 var(--search-gap) 0 ${edge}`,
    });
  });

  test('makes a line of the diff as tall as the font size of code times the line height, rounded to whole pixels, as the app places the rows a whole number of lines apart', () => {
    assert.strictEqual(
      compact(cascaded(diffView(), '--diff-line-height')),
      'round(var(--monospace-font-size) * var(--monospace-line-height), 1px)',
    );
  });

  test('wraps long lines of code at spaces, breaking a word only where it would not fit, in rows as tall as their lines', () => {
    const inline = shownRow(diffView({ wordWrap: true }, inlineLine('added')));
    looks(inline, { width: '100%' });
    looks(withClass(inline, 'text-line'), {
      height: 'auto',
      'min-height': 'var(--diff-line-height)',
    });
    looks(withClass(inline, 'code'), {
      'white-space': 'pre-wrap',
      'overflow-wrap': 'anywhere',
      'min-width': '0',
    });
    const split = shownRow(
      diffView(
        { sideBySide: true, wordWrap: true },
        splitLine('removed', 'added'),
      ),
    );
    for (const side of allWithClass(split, 'split-code')) {
      looks(withClass(side, 'code'), {
        display: 'block',
        transform: 'none',
        'white-space': 'pre-wrap',
      });
    }
  });

  test('indents the rows a long line wraps onto by its indentation, keeping the indentation on the row with the code it indents', () => {
    looks(withClass(indented(true), 'code'), {
      'padding-left':
        'calc(var(--diff-code-padding) + var(--wrap-indent, 0px))',
      'text-indent': 'calc(-1 * var(--wrap-indent, 0px))',
    });
    looks(withClass(indented(true), 'lead'), { 'white-space': 'pre' });
    looks(withClass(indented(false), 'code'), {
      'padding-left': undefined,
      'text-indent': undefined,
    });
  });

  test('shows the sign of each blank of an indented wrapped line on that blank, as the indentation hanging its rows moved the signs aside, squeezing them together', () => {
    looks(
      withClass(indented(true), 'blank'),
      { 'text-indent': '0' },
      { pseudoElement: '::before' },
    );
  });

  test('ends the lines scrolled sideways before the minimap, keeping their rows tinted under it, but wraps lines under it, as text goes under the scrollbars everywhere else, with room for the sign of a break, so both sides wrap alike', () => {
    for (const wordWrap of [false, true]) {
      const clear = wordWrap
        ? 'calc(2 * var(--diff-code-padding) + 2ch)'
        : 'calc(var(--diff-code-padding) + var(--minimap-width))';
      looks(
        withClass(
          shownRow(diffView({ wordWrap }, inlineLine('added'))),
          'code',
        ),
        { 'padding-right': clear },
      );
      const [left, right] = allWithClass(
        shownRow(diffView({ sideBySide: true, wordWrap }, splitLine('', ''))),
        'split-side',
      ).map((side) => withClass(side, 'code'));
      looks(right, { 'padding-right': clear });
      looks(left, {
        'padding-right': wordWrap
          ? cascaded(right, 'padding-right')
          : undefined,
      });
    }
  });

  test('draws a tab in the code as wide as the wrapping and the hidden changes count it', () => {
    for (const wordWrap of [false, true]) {
      looks(
        withClass(
          shownRow(diffView({ wordWrap }, inlineLine('context'))),
          'code',
        ),
        { 'tab-size': 'var(--diff-tab-size)' },
      );
    }
    assert.strictEqual(layoutVariables['--diff-tab-size'], String(tabSize));
  });

  test('writes the title of the checked-out commit in bold, in its whole message too', () => {
    const checkedOut = withClass(
      rendered(commitRow({ headCommit: 'a' })),
      'subject',
    );
    looks(checkedOut, { 'font-weight': '600' });
    looks(withClass(rendered(commitRow({ headCommit: 'b' })), 'subject'), {
      'font-weight': undefined,
    });
    looks(withClass(messagePanel({ headCommit: 'a' }), 'subject'), {
      'font-weight': cascaded(checkedOut, 'font-weight'),
    });
    looks(withClass(messagePanel({ headCommit: 'b' }), 'subject'), {
      'font-weight': undefined,
    });
  });

  test("pops a commit's row out over itself like the other popups, ringed with their edge over the row's tint, letting the pointer through to the rows under it", () => {
    const panel = messagePanel();
    looks(panel, {
      position: 'fixed',
      'box-sizing': 'border-box',
      'margin-right': 'var(--gutter-width)',
      background: 'var(--color-panel-background)',
      'border-radius': 'var(--card-radius)',
      'pointer-events': 'none',
    });
    const [edge] = (bodyVariable('popup-shadow') ?? '').split(',');
    assert.match(edge, /^inset /);
    looks(
      panel,
      {
        position: 'absolute',
        inset: '0',
        'border-radius': 'inherit',
        'box-shadow': edge,
      },
      after,
    );
  });

  test("casts the shadow of a popped-out row from behind its text rather than from the row, as a shadow on the text's own layer turns its subpixel antialiasing off, blurring it next to the rows, cutting a long message off inside the row instead, as cutting the popup off would cut its shadow off too", () => {
    const panel = messagePanel();
    looks(panel, { overflow: undefined, 'box-shadow': undefined });
    looks(
      panel,
      {
        content: "''",
        position: 'absolute',
        inset: '0',
        'z-index': '-1',
        'border-radius': 'inherit',
        'box-shadow': 'var(--popup-shadow)',
      },
      { pseudoElement: '::before' },
    );
    looks(withClass(panel, 'commit'), {
      'box-sizing': 'border-box',
      'max-height': 'inherit',
      overflow: 'hidden',
      'border-radius': 'inherit',
    });
  });

  test("extends the popped-out row: as white as the other popups, though its row is under the pointer or selected, or the pointer is on it pinned, its subject wrapped in lines as tall as the row's, its author and date as wide as the row, then the rest of the message with its line breaks", () => {
    const panel = messagePanel();
    const row = withClass(panel, 'commit');
    looks(row, { 'border-bottom': 'none', background: 'none' });
    looks(row, { background: 'none' }, hovered);
    looks(withClass(messagePanel({ selected: 'a' }), 'commit'), {
      background: 'none',
    });
    const rowLine = cascaded(
      withClass(rendered(commitRow()), 'commit-line'),
      'height',
    );
    assert.ok(rowLine);
    looks(withClass(panel, 'commit-line'), { height: 'auto' });
    looks(withClass(panel, 'subject'), {
      'line-height': rowLine,
      'white-space': 'normal',
      'overflow-wrap': 'anywhere',
    });
    looks(withClass(panel, 'commit-line', 'secondary'), {
      height: rowLine,
      width: 'var(--peek-row-width)',
    });
    looks(withClass(panel, 'message-body'), {
      'line-height': rowLine,
      'white-space': 'pre-wrap',
      'overflow-wrap': 'anywhere',
    });
  });

  test('fills the search button in the border color, as the search fields are until used, and draws the strip between hunks in it', () => {
    looks(withClass(searchButton(), 'search-button'), {
      background: 'var(--color-border)',
    });
    looks(
      withClass(
        diffView({}, diffRow(createElement(HunkDivider))),
        'hunk-divider',
      ),
      { background: 'var(--color-border)' },
    );
  });

  test("fills every round button in the border color, but in the color of the tab bar or a popup's title it sits on, showing no circle there, and in the panel's on a file's header, tinting an open menu's button over its fill and ringing a button's dot in it", () => {
    assert.strictEqual(
      bodyVariable('button-background'),
      'var(--color-border)',
    );
    for (const bar of [
      withClass(tabBar(), 'tabs'),
      withClass(shortcutsPopup(), 'shortcuts-title'),
      withClass(aboutPopup(), 'shortcuts-title'),
    ]) {
      looks(bar, {
        background: 'var(--color-background)',
        '--button-background': 'var(--color-background)',
      });
    }
    looks(withClass(diffView({}, fileHeader), 'file-header'), {
      background: 'var(--color-border)',
      '--button-background': 'var(--color-panel-background)',
    });
    const diff = rendered(diffOptions());
    const laidOut = allWithClass(withClass(diff, 'segmented'), 'nav-button');
    for (const button of [
      ...allWithClass(rendered(navButtons()), 'nav-button'),
      ...allWithClass(diff, 'nav-button').filter(
        (option) => !laidOut.includes(option),
      ),
      withClass(rendered(menuButton()), 'nav-button'),
      withClass(shortcutsPopup(), 'nav-button'),
      withClass(
        diffView(
          {},
          diffRow(
            createElement(FileHeader, {
              path: 'v.svg',
              open: true,
              whole: false,
              collapsible: true,
              onClick: noop,
              preview: 'image',
              onRender: noop,
            }),
          ),
        ),
        'file-header-button',
      ),
    ]) {
      assert.ok(!button.classes.includes('active'));
      looks(button, { background: 'var(--button-background)' });
    }
    looks(
      rendered(
        createElement('button', {
          className: 'nav-button menu-button-trigger open',
        }),
      ),
      {
        background:
          'linear-gradient(var(--hover-background), var(--hover-background)), var(--button-background)',
      },
    );
    assert.match(
      cascaded(
        withClass(rendered(menuButton({ marked: true })), 'menu-mark'),
        'box-shadow',
      ) ?? '',
      /^0 0 0 \S+ var\(--button-background\)$/,
    );
  });

  test('rings a button or link the keyboard reached in the focus color, in whole pixels inside its edge like the active column, so nothing around it clips it, but not a menu item, which it tints instead, nor a popup taking the keyboard', () => {
    const edge = activeEdge();
    assert.match(edge, /^\d+px$/);
    const ring = {
      outline: `${edge} solid var(--color-focus)`,
      'outline-offset': `-${edge}`,
    };
    const about = aboutPopup();
    for (const control of [
      withClass(tabBar(), 'tab-add'),
      withClass(tabBar(), 'tab-close'),
      withClass(notices(), 'notice-close'),
      withClass(rendered(navButtons()), 'nav-button'),
      withClass(about, 'about-copy'),
      withClass(about, 'nav-button'),
      about.children[1]?.children.find((child) => child.tag === 'a'),
    ]) {
      looks(control, ring, { focus: control });
    }
    looks(withClass(tabBar(), 'tab-add'), { outline: undefined });
    const item = withClass(contextMenu(), 'menu-item');
    looks(item, { outline: 'none' }, { focus: item });
    looks(about, { outline: 'none' }, { focus: about });
    const pinned = messagePanel({}, true);
    const close = withClass(pinned, 'message-close');
    looks(close, ring, { focus: close });
    const description = withClass(pinned, 'message-body');
    looks(pinned, { outline: 'none' }, { focus: pinned });
    looks(description, { outline: 'none' }, { focus: description });
  });

  test('tints a row under the pointer with a see-through touch of the focus color, over whatever lies under it', () => {
    assert.strictEqual(
      bodyVariable('hover-background'),
      'color-mix( in srgb, var(--color-focus) var(--color-focus-hover), transparent )',
    );
    for (const row of [
      allWithClass(tabBar(), 'tab').find(
        (tab) => !tab.classes.includes('active'),
      ),
      fileRow(fileChange('src/a.ts')),
      folderRow(),
      rendered(commitRow()),
      workingTreeRow(1),
    ]) {
      looks(row, { background: 'var(--hover-background)' }, hovered);
    }
  });

  test('tints a hovered button like a hovered row, and a switched-on toggle as strongly as a selection, both see-through', () => {
    assert.strictEqual(
      bodyVariable('toggle-on-background'),
      'color-mix( in srgb, var(--color-focus) var(--color-focus-selected), transparent )',
    );
    for (const button of [
      withClass(tabBar(), 'tab-close'),
      withClass(notices(), 'notice-close'),
    ]) {
      looks(button, { background: 'var(--hover-background)' }, hovered);
    }
    looks(soloButton(true, false), {
      background: 'var(--toggle-on-background)',
    });
  });

  test('starts the label of an item with a submenu where the others start, keeping its gap only before the arrow', () => {
    const menu = rendered(
      createElement(ContextMenu, {
        menu: {
          x: 0,
          y: 0,
          items: [
            { label: 'Checkout', submenu: [{ label: 'main', onClick: noop }] },
          ],
        },
        onClose: noop,
      }),
    );
    looks(withClass(menu, 'menu-item', 'has-submenu'), { gap: undefined });
    const arrow = withClass(menu, 'submenu-arrow');
    looks(arrow, { 'margin-left': 'auto' });
    assert.ok(parseFloat(cascaded(arrow, 'padding-left') ?? '') > 0);
  });

  test("puts a removable item's X at the right end of its entry, drawn like a tab's X and shown only on hovering or reaching the entry, keeping the label clear of it", () => {
    const menu = rendered(
      createElement(ContextMenu, {
        menu: {
          x: 0,
          y: 0,
          items: [{ label: 'app', onRemove: noop, removeTitle: 'Remove app' }],
        },
        onClose: noop,
      }),
    );
    const entry = withClass(menu, 'menu-entry');
    const remove = withClass(menu, 'menu-remove');
    const tabClose = withClass(tabBar(), 'tab-close');
    looks(
      remove,
      Object.fromEntries(
        ['width', 'height', 'border-radius'].map((property) => [
          property,
          cascaded(tabClose, property),
        ]),
      ),
    );
    looks(remove, { position: 'absolute', visibility: 'hidden' });
    looks(remove, { visibility: undefined }, { hover: entry });
    looks(
      remove,
      { visibility: undefined },
      { focus: withClass(menu, 'menu-item') },
    );
    looks(remove, { background: 'var(--hover-background)' }, hovered);
    assert.ok(
      parseFloat(
        cascaded(withClass(menu, 'menu-item'), 'padding-right') ?? '',
      ) >=
        parseFloat(cascaded(remove, 'right') ?? '') +
          parseFloat(cascaded(remove, 'width') ?? ''),
    );
  });

  test('fills the search fields, the search button and the worktree chips alike, and tints them alike when hovered, the edges of the fields included', () => {
    const fields = [withClass(locationsPopup(''), 'locations-search')];
    const chip = allWithClass(
      worktreeBar([worktree('a'), worktree('b')], '/a'),
      'tab',
    ).find((tab) => !tab.classes.includes('active'));
    const tinted =
      'linear-gradient(var(--hover-background), var(--hover-background)), var(--color-border)';
    for (const field of [
      ...fields,
      withClass(searchButton(), 'search-button'),
      chip,
    ]) {
      looks(field, { background: 'var(--color-border)' });
      looks(field, { background: tinted }, hovered);
    }
    for (const field of fields) {
      looks(field, { 'border-color': 'transparent' }, hovered);
    }
  });

  test("fills and edges the popup's search box in the border color like the other search fields until it is focused or holds a query, then in the panel's", () => {
    const empty = withClass(locationsPopup(''), 'locations-search');
    looks(empty, {
      background: 'var(--color-border)',
      border: '1px solid var(--color-border)',
    });
    looks(
      empty,
      {
        background: 'var(--color-panel-background)',
        'border-color': 'var(--color-focus)',
      },
      focused,
    );
    const searched = withClass(locationsPopup('main'), 'locations-search');
    for (const states of [{}, hovered]) {
      looks(
        searched,
        {
          background: 'var(--color-panel-background)',
          'border-color': 'var(--color-border)',
        },
        states,
      );
    }
  });

  test('draws the scrollbars and the minimap viewport in the one scrollbar color, as see-through as the theme says at rest, hovered and dragged', () => {
    for (const [name, state] of [
      ['scrollbar-background', 'rest'],
      ['scrollbar-hover-background', 'hover'],
      ['scrollbar-active-background', 'drag'],
    ]) {
      assert.strictEqual(
        bodyVariable(name),
        `color-mix( in srgb, var(--color-scrollbar) var(--color-scrollbar-${state}), transparent )`,
        name,
      );
    }
    const resting = { background: 'var(--scrollbar-background) padding-box' };
    const hover = { 'background-color': 'var(--scrollbar-hover-background)' };
    const drag = { 'background-color': 'var(--scrollbar-active-background)' };
    looks(overlayScrollbar('shown'), resting);
    looks(overlayScrollbar('shown'), hover, hovered);
    looks(overlayScrollbar('shown dragging'), drag);
    const viewport = withClass(minimap(), 'minimap-viewport');
    looks(viewport, resting);
    looks(viewport, hover, { hover: minimap() });
    looks(
      withClass(
        rendered(
          createElement(
            'div',
            { className: 'diff-minimap shown dragging' },
            createElement('div', { className: 'minimap-viewport' }),
          ),
        ),
        'minimap-viewport',
      ),
      drag,
    );
  });

  test('draws the minimap marks as see-through as the theme says', () => {
    for (const [kind, color] of [
      ['added', 'added'],
      ['removed', 'deleted'],
    ]) {
      looks(withClass(minimap(), 'minimap-mark', kind), {
        opacity: undefined,
        background: `color-mix( in srgb, var(--color-${color}) var(--color-${color}-minimap), transparent )`,
      });
    }
  });

  test('draws the bar where words were inserted on the other line across the whole line, as wide as the app makes it, centered on its place and in the color of changed words', () => {
    for (const [kind, color] of [
      ['added', 'added'],
      ['removed', 'deleted'],
    ] as const) {
      looks(
        withClass(
          diffView({}, inlineLine(kind, { words: [{ start: 1, end: 1 }] })),
          'word-gap',
        ),
        {
          position: 'absolute',
          width: 'var(--diff-gap-width)',
          height: 'var(--diff-line-height)',
          'margin-left': 'calc(var(--diff-gap-width) / -2)',
          'padding-top': '0',
          'padding-bottom': '0',
          background: `color-mix( in srgb, var(--color-${color}) var(--color-${color}-line), transparent )`,
        },
      );
    }
  });

  test('tints the line numbers of a changed line with its row, and its changed characters as strongly as the theme says, the full height of the line', () => {
    for (const [kind, color, word] of [
      ['added', 'added', 'word-added'],
      ['removed', 'deleted', 'word-removed'],
    ] as const) {
      const inline = shownRow(
        diffView({}, inlineLine(kind, { words: [{ start: 0, end: 1 }] })),
      );
      looks(withClass(inline, word), {
        background: `color-mix( in srgb, var(--color-${color}) var(--color-${color}-line), transparent )`,
        'padding-top': 'var(--diff-word-padding-top)',
        'padding-bottom': 'var(--diff-word-padding-bottom)',
      });
      const split = shownRow(
        diffView(
          { sideBySide: true },
          splitLine(
            kind === 'removed' ? kind : '',
            kind === 'added' ? kind : '',
          ),
        ),
      );
      for (const number of [
        ...allWithClass(inline, 'number'),
        ...allWithClass(split, 'number'),
      ]) {
        looks(number, { background: undefined, 'background-color': undefined });
      }
    }
  });

  test('tints the whole row of every added and removed line more lightly, as the theme says, in the colors their minimap marks are drawn in', () => {
    for (const [kind, color] of [
      ['added', 'added'],
      ['removed', 'deleted'],
    ] as const) {
      const tint = {
        background: `color-mix( in srgb, var(--color-${color}) var(--color-${color}-row), transparent )`,
      };
      looks(withClass(diffView({}, inlineLine(kind)), 'text-line'), tint);
      looks(
        withClass(
          diffView(
            { sideBySide: true },
            splitLine(
              kind === 'removed' ? kind : '',
              kind === 'added' ? kind : '',
            ),
          ),
          'split-side',
          kind,
        ),
        tint,
      );
    }
  });

  test('tints the whole row of a line changed through like changed words on a changed row, their tint over the row tint', () => {
    for (const [kind, color] of [
      ['added', 'added'],
      ['removed', 'deleted'],
    ] as const) {
      const word = `color-mix(in srgb, var(--color-${color}) var(--color-${color}-line), transparent)`;
      const tint = `linear-gradient(${word}, ${word}), color-mix(in srgb, var(--color-${color}) var(--color-${color}-row), transparent)`;
      for (const row of [
        withClass(diffView({}, inlineLine(kind, { whole: true })), 'text-line'),
        withClass(
          diffView(
            { sideBySide: true },
            splitLine(
              kind === 'removed' ? `${kind} whole-change` : 'filler',
              kind === 'added' ? `${kind} whole-change` : 'filler',
            ),
          ),
          'split-side',
          kind,
        ),
      ]) {
        assert.strictEqual(compact(cascaded(row, 'background')), tint);
      }
    }
  });

  test('draws a menu like the other popups, its separators in the border color and the item under the pointer like a selected row', () => {
    for (const menu of [contextMenu(), historyMenu()]) {
      looks(menu, {
        background: 'var(--color-panel-background)',
        'box-shadow': 'var(--popup-shadow)',
        border: undefined,
      });
    }
    looks(withClass(contextMenu(), 'menu-separator'), {
      background: 'var(--color-border)',
    });
    looks(
      withClass(contextMenu(), 'menu-item'),
      { background: 'var(--selection-background)' },
      hovered,
    );
  });

  test('tints a selected row and the active search result alike, with the focus color', () => {
    assert.strictEqual(
      bodyVariable('selection-background'),
      'color-mix( in srgb, var(--color-focus) var(--color-focus-selected), var(--color-panel-background) )',
    );
    for (const row of [
      fileRow(fileChange('src/a.ts'), true),
      rendered(commitRow({ selected: 'a' })),
      withClass(locationsPopup('m'), 'row', 'result', 'active'),
    ]) {
      for (const states of [{}, hovered]) {
        looks(row, { background: 'var(--selection-background)' }, states);
      }
    }
  });

  test('dims a clean working tree like an author or a folder', () => {
    looks(withClass(workingTreeRow(0), 'subject'), {
      opacity: 'var(--muted-opacity)',
    });
    looks(withClass(workingTreeRow(1), 'subject'), { opacity: undefined });
  });

  test('draws every bubble but the checked-out one and tags alike, in the bubble colors, ringed inside in the bubble border color to stand apart from a selected row', () => {
    const all = bubbles().filter(
      (bubble) =>
        !bubble.classes.includes('checked-out') &&
        !bubble.classes.includes('tag') &&
        !bubble.classes.includes('remote-tag'),
    );
    for (const kind of ['branch', 'remote', 'stash', 'hash', 'missing']) {
      assert.ok(
        all.some((bubble) => bubble.classes.includes(kind)),
        kind,
      );
    }
    for (const bubble of all) {
      looks(bubble, {
        color: 'var(--color-bubble-foreground)',
        background: 'var(--color-bubble)',
        'box-shadow': 'inset 0 0 0 1px var(--color-bubble-border)',
        border: undefined,
      });
    }
  });

  test('draws the button that shows a large diff in the solid focus color', () => {
    looks(
      withClass(
        rendered(
          createElement(
            'div',
            { className: 'large-diff' },
            createElement('button', { className: 'show' }),
          ),
        ),
        'show',
      ),
      {
        color: 'var(--color-focus-foreground)',
        background:
          'linear-gradient(var(--color-focus), var(--color-focus)), var(--color-panel-background)',
      },
    );
  });

  test('shapes a tag like a tag icon, pointed at the right end with the corners of the point rounded by about a pixel and a round hole by the point that shows the row through it, leaving room for both after the name, so it stands apart from the branches, which move on as tags never do', () => {
    const tags = bubbles().filter(
      (bubble) =>
        bubble.classes.includes('tag') || bubble.classes.includes('remote-tag'),
    );
    for (const kind of ['tag', 'remote-tag']) {
      assert.ok(
        tags.some((tag) => tag.classes.includes(kind)),
        kind,
      );
    }
    for (const tag of tags) {
      assert.strictEqual(
        unwrapped(cascaded(tag, 'background')),
        'radial-gradient(circle at calc(100% - 9px) 50%, transparent 2px, var(--color-bubble) 2.5px)',
      );
      assert.strictEqual(
        unwrapped(cascaded(tag, 'clip-path')),
        'shape(from 0 0, hline to calc(100% - 8px), curve to calc(100% - 6.4px) 0.8px with calc(100% - 7px) 0, line to calc(100% - 0.8px) calc(50% - 1px), curve to calc(100% - 0.8px) calc(50% + 1px) with 100% 50%, line to calc(100% - 6.4px) calc(100% - 0.8px), curve to calc(100% - 8px) 100% with calc(100% - 7px) 100%, hline to 0, close)',
      );
      looks(tag, {
        color: 'var(--color-bubble-foreground)',
        'box-shadow': cascaded(branchBubble(), 'box-shadow'),
        border: undefined,
      });
      assert.ok(
        parseFloat(cascaded(tag, 'padding-right') ?? '') >= tagHoleReach(tag),
      );
    }
  });

  test("keeps a tag's hole and point clear of the push button on it, which squares off, as the tag goes on past it", () => {
    const tag = withClass(
      rendered(
        createElement(
          TagActions.Provider,
          {
            value: {
              remote: 'origin',
              onRemote: new Set<string>(),
              pushing: [],
              onPush: noop,
            },
          },
          createElement(
            'div',
            { className: 'bubble-line' },
            createElement(RefBubble, {
              info: { kind: 'tag', name: 'v1' },
              actions: true,
            }),
          ),
        ),
      ),
      'badge',
    );
    assert.ok(
      parseFloat(cascaded(tag, 'padding-right') ?? '') >= tagHoleReach(tag),
    );
    looks(withClass(tag, 'bubble-action'), { 'border-radius': '0' });
  });

  test('keeps a bubble with buttons within its line, cutting off its long name with an ellipsis and never its buttons', () => {
    const line = rendered(
      createElement(
        BranchActions.Provider,
        {
          value: { pulling: false, pushing: false, onPull: noop, onPush: noop },
        },
        createElement(
          CheckedOutBranch.Provider,
          { value: 'docs/a-branch-name-longer-than-its-line' },
          createElement(
            'div',
            { className: 'bubble-line' },
            createElement(RefBubble, {
              info: {
                kind: 'branch',
                name: 'docs/a-branch-name-longer-than-its-line',
              },
              actions: true,
            }),
          ),
        ),
      ),
    );
    looks(withClass(line, 'badge', 'with-actions'), {
      'max-width': 'calc(100% + var(--bubble-inset))',
    });
    looks(withClass(line, 'bubble-name'), {
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
      'min-width': '0',
    });
    looks(withClass(line, 'bubble-actions'), { flex: 'none' });
  });

  test('dims an arrow of the blue bubble with nothing to do, and counts in figures of one width, so the bubble keeps its size as the counts change', () => {
    const actions = rendered(
      createElement(BubbleActions, {
        pulling: false,
        pushing: false,
        onPull: noop,
        onPush: noop,
        tracking: { upstream: 'origin/main', ahead: 0, behind: 12 },
      }),
    );
    looks(withClass(actions, 'bubble-action', 'idle'), {
      opacity: 'var(--muted-opacity)',
    });
    looks(withClass(actions, 'bubble-count'), {
      'font-variant-numeric': 'tabular-nums',
    });
  });

  test('fills the checked-out bubble with its own colors, ringing it like the others in its own border color, and no bubble changes under the pointer', () => {
    const all = bubbles('main');
    const checkedOut = all.filter((bubble) =>
      bubble.classes.includes('checked-out'),
    );
    for (const kind of ['head', 'branch']) {
      assert.ok(
        checkedOut.some((bubble) => bubble.classes.includes(kind)),
        kind,
      );
    }
    const ring = cascaded(branchBubble(), 'box-shadow')?.replace(
      'var(--color-bubble-border)',
      'var(--color-bubble-checked-out-border)',
    );
    for (const bubble of checkedOut) {
      looks(bubble, {
        color: 'var(--color-bubble-checked-out-foreground)',
        background: 'var(--color-bubble-checked-out)',
        'box-shadow': ring,
        border: undefined,
      });
    }
    assert.ok(all.some((bubble) => bubble.parent?.classes.includes('active')));
    for (const bubble of all) {
      looksAlike(bubble, bubbleLook, hovered);
    }
  });

  test('hides every column but the commits while no commit is selected', () => {
    assert.deepStrictEqual(columnVisibility(undefined), [
      undefined,
      'hidden',
      'hidden',
    ]);
    assert.deepStrictEqual(columnVisibility('a'), [
      undefined,
      undefined,
      undefined,
    ]);
  });

  test('hides the diff while the commit selected has no change to show, keeping its place', () => {
    assert.deepStrictEqual(columnVisibility('a', false), [
      undefined,
      undefined,
      'hidden',
    ]);
  });

  test('grabs a column edge over the gap between the columns without painting it, even while dragging', () => {
    const resizer = withClass(columns(columnsClass(true, 'a')), 'resizer');
    looks(resizer, {
      width: '6px',
      right: `calc(-${halved(cascaded(resizer, 'width'))} - var(--gutter-width) / 2)`,
      cursor: 'col-resize',
    });
    for (const states of [{}, hovered]) {
      looks(
        resizer,
        { background: undefined, 'background-color': undefined },
        states,
      );
    }
    looks(rendered(createElement('body', { className: 'resizing' })), {
      cursor: 'col-resize',
    });
  });

  test('spins the icon of a running button', () => {
    for (const icon of [
      withClass(rendered(navButtons({ fetching: true })), 'spin-icon'),
      withClass(soloButton(false, true), 'spin-icon'),
    ]) {
      assert.match(
        cascaded(icon, 'animation') ?? '',
        /^spin \S+ linear infinite$/,
      );
    }
    looks(withClass(rendered(navButtons()), 'spin-icon'), {
      animation: undefined,
    });
  });

  test('marks the fetch button in the warning color while stale and the error color when failed, as a dot outside the spinning icon', () => {
    const stale = rendered(
      navButtons({
        lastFetch: { succeeded: 0 },
        autoFetch: true,
        autoFetchMinutes: 1,
      }),
    );
    const failed = rendered(navButtons({ lastFetch: { failed: 0 } }));
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
    const mark = withClass(rendered(menuButton({ marked: true })), 'menu-mark');
    const fetchMark = withClass(
      rendered(navButtons({ lastFetch: { failed: 0 } })),
      'fetch-mark',
    );
    looks(mark, {
      position: cascaded(fetchMark, 'position'),
      'border-radius': cascaded(fetchMark, 'border-radius'),
      background: 'var(--color-focus)',
    });
    looks(mark?.parent, { position: 'relative' });
    assert.deepStrictEqual(
      allWithClass(rendered(menuButton()), 'menu-mark'),
      [],
    );
  });

  test('draws a commit row and the one-line working tree row as tall as the list expects, as even lines of text', () => {
    const commit = rendered(commitRow({ refs: repository.refs }));
    const { frame, line } = frameAndLine(commit);
    assert.strictEqual(frame + 2 * line, commitRowHeight);
    const workingTree = frameAndLine(workingTreeRow(1));
    assert.strictEqual(
      workingTree.frame + workingTree.line,
      workingTreeRowHeight,
    );
    looks(withClass(commit, 'commit-line', 'secondary'), {
      height: `${line}px`,
      margin: undefined,
      'margin-top': undefined,
      'margin-bottom': undefined,
    });
    looks(withClass(commit, 'bubble-line'), {
      'line-height': `${bubbleLineHeight}px`,
    });
    assert.strictEqual(bubbleLineHeight, line);
  });

  test('lets the graph of a row draw past its edges, so its lines can reach over the ends of those of the row above', () => {
    looks(
      rendered(
        createElement(GraphCell, {
          row: { lane: 0, color: 0, lines: [] },
          height: commitRowHeight,
          onToggleMerge: noop,
        }),
      ),
      { overflow: 'visible' },
    );
  });

  test('draws bubbles in the flow of their line, starting where the other lines start, each kept within the line, cutting off its long name with an ellipsis', () => {
    const commit = rendered(commitRow({ refs: repository.refs }));
    const line = cascaded(withClass(commit, 'bubble-line'), 'line-height');
    for (const badge of allWithClass(commit, 'badge')) {
      const height = cascaded(badge, 'height');
      looks(badge, {
        display: 'inline-block',
        'max-width': 'calc(100% + var(--bubble-inset))',
        'line-height': height,
        'vertical-align': 'top',
        overflow: 'hidden',
        'text-overflow': 'ellipsis',
        padding: '0 var(--bubble-inset)',
      });
      const margin = sidesOf(badge, 'margin');
      assert.strictEqual(margin.left, 'calc(-1 * var(--bubble-inset))');
      assert.ok(
        parseFloat(margin.top) + parseFloat(height ?? '') <=
          parseFloat(line ?? ''),
      );
    }
    looks(withClass(commit, 'bubble-line'), {
      'margin-left': 'calc(-1 * var(--bubble-inset))',
      'padding-left': 'var(--bubble-inset)',
    });
  });

  test("draws the bubbles of a commit a search found as in the commit list, cutting off only a ref that is a result's own row", () => {
    const commit = commitRow({
      refs: [{ kind: 'branch', name: 'main', commit: 'a' }],
    });
    assert.deepStrictEqual(
      badgeRules(createElement('div', { className: 'locations-list' }, commit)),
      badgeRules(commit),
    );
    looks(
      withClass(
        rendered(
          createElement(
            'div',
            { className: 'locations-list' },
            createElement(
              'div',
              { className: 'row result' },
              createElement(RefBubble, {
                info: { kind: 'branch', name: 'main' },
              }),
            ),
          ),
        ),
        'badge',
      ),
      { overflow: 'hidden', 'text-overflow': 'ellipsis' },
    );
  });

  test('gives a row of the other columns the fixed height of a diff row, whatever the font, so the columns line up', () => {
    for (const row of [fileRow(fileChange('src/a.ts')), folderRow()]) {
      looks(row, {
        'box-sizing': 'border-box',
        height: `${rowHeight({ kind: 'hunk', file: 0 })}px`,
      });
    }
  });

  test('puts the dots of a hunk divider under the line numbers, in both of them inline and in the one of a side by side', () => {
    looks(hunkDots(false), { width: 'calc(2 * var(--diff-number-width))' });
    looks(hunkDots(true), { width: 'var(--diff-number-width)' });
  });

  test('cuts off every long name in a row with an ellipsis', () => {
    for (const row of [
      fileRow(fileChange('src/a.ts')),
      fileRow(fileChange('src/a.ts', { status: 'D' })),
      fileRow(undefined),
      folderRow(),
    ]) {
      looks(withClass(row, 'path'), {
        overflow: 'hidden',
        'text-overflow': 'ellipsis',
        'min-width': '0',
      });
    }
  });

  test("lines a folder's name up with the names of the files beside it, leaving no gap after its twisty", () => {
    looks(folderRow(), { gap: undefined });
  });

  test('highlights no loading placeholder on hover', () => {
    for (const placeholder of [
      skeletonRow(),
      skeletonRow('diff-line'),
      rendered(createElement('div', { className: 'commit placeholder' })),
      withClass(locationsPopup('abcd'), 'hash-suggestion', 'empty'),
    ]) {
      looks(placeholder, { background: 'none' }, hovered);
    }
  });

  test('scrolls a submenu taller than the window, which lists every ref at a commit', () => {
    looks(rendered(createElement('div', { className: 'menu submenu' })), {
      'box-sizing': 'border-box',
      'max-height': '100vh',
      'overflow-y': 'auto',
    });
  });

  test('lines the first item of a submenu up with the item that opens it', () => {
    const submenu = rendered(
      createElement('div', { className: 'menu submenu' }),
    );
    assert.strictEqual(cascaded(submenu, 'border'), undefined);
    const padding = cascaded(submenu, 'padding');
    assert.match(padding ?? '', /^\d+px$/);
    assert.strictEqual(cascaded(submenu, 'top'), `-${padding}`);
  });

  test('highlights no disabled menu item on hover, whose text would vanish in the selection color', () => {
    const [enabled, disabled] = allWithClass(contextMenu(), 'menu-item');
    assert.ok(disabled.attributes.has('disabled'));
    looks(enabled, { color: 'var(--color-foreground)' }, hovered);
    for (const states of [hovered, focused]) {
      looksAlike(disabled, ['color', 'background'], states);
    }
  });

  test('highlights the menu item the keys are on like the one under the pointer, without an outline', () => {
    const [item] = allWithClass(contextMenu(), 'menu-item');
    looksAlike(item, ['color', 'background'], focused, hovered);
    assert.notStrictEqual(
      cascaded(item, 'background', focused),
      cascaded(item, 'background'),
    );
    for (const states of [{}, focused]) {
      looks(item, { outline: 'none' }, states);
    }
  });

  test("edges a popup with an inset shadow rather than a border, which Chromium rounds to whole device pixels, shifting the popup's contents at scales like 125%", () => {
    assert.match(
      bodyVariable('popup-shadow') ?? '',
      /^inset 0 0 0 1px var\(--color-border\),/,
    );
    for (const popup of [
      contextMenu(),
      historyMenu(),
      shortcutsPopup(),
      withClass(notices(), 'notice'),
    ]) {
      looks(popup, { 'box-shadow': 'var(--popup-shadow)', border: undefined });
    }
  });

  test("lays a sticky location row's see-through hover color over its solid background, so rows under it stay hidden", () => {
    const sticky = withClass(locationsPopup(''), 'tree-row', 'sticky');
    looks(sticky, { background: 'var(--popup-background)' });
    looks(
      sticky,
      {
        background:
          'linear-gradient(var(--hover-background), var(--hover-background)), var(--popup-background)',
      },
      hovered,
    );
  });

  test('shows that nothing changed as a dimmed row above the empty list, which still fills the column to take the keys', () => {
    const column = rendered(
      renderedBy(Column, {
        children: [
          createElement(VirtualRows, {
            key: 'rows',
            rows: listedFilesRows([]),
            renderRow: noop,
            selectedKey: undefined,
          }),
          createElement('div', { key: 'empty', className: 'row empty' }),
        ],
      }),
    );
    looks(withClass(column, 'column-body'), {
      display: 'flex',
      'flex-direction': 'column',
    });
    const row = fileRow(fileChange('src/a.ts'));
    looks(withClass(column, 'empty'), {
      order: '-1',
      'flex-shrink': '0',
      height: cascaded(row, 'height'),
      padding: cascaded(row, 'padding'),
      color: 'var(--muted-foreground)',
    });
    looks(withClass(column, 'virtual-rows'), {
      flex: '1',
      'min-height': '0',
    });
  });

  test('keeps the button of a file header clear of the minimap, within the header, and in view however wide the lines make the header', () => {
    const header = withClass(
      diffView(
        {},
        diffRow(
          createElement(FileHeader, {
            path: 'v.svg',
            open: true,
            whole: false,
            collapsible: true,
            onClick: noop,
            preview: 'image',
            onRender: noop,
          }),
        ),
      ),
      'file-header',
    );
    const padding = paddingOf(header);
    assert.strictEqual(
      padding.right,
      `calc(${padding.left} + var(--minimap-width))`,
    );
    looks(header, { height: 'var(--diff-file-height)' });
    assert.ok(
      parseFloat(
        cascaded(withClass(header, 'file-header-button'), 'height') ?? '',
      ) <=
        (rowHeight({
          kind: 'file',
          file: 0,
          path: 'v.svg',
          open: true,
          collapsible: true,
        }) ?? 0),
    );
    const end = withClass(header, 'file-header-end');
    assert.ok(
      end.children.some((child) =>
        child.classes.includes('file-header-button'),
      ),
    );
    looks(end, { position: 'sticky', right: padding.right });
  });

  test('lets only the diff, errors and notices be selected, not the controls around them', () => {
    looks(body, { 'user-select': 'none' });
    const view = diffView({}, fileHeader);
    for (const selectable of [
      view,
      withClass(notices(), 'notice-message'),
      withClass(
        rendered(
          createElement(Crash, {
            title: 'Fastforward',
            error: new Error('boom'),
            onReload: noop,
          }),
        ),
        'error-message',
      ),
    ]) {
      looks(selectable, { 'user-select': 'text' });
    }
    looks(withClass(view, 'file-header'), { 'user-select': 'none' });
  });

  test('lets a selection started on one side of the side-by-side diff take the code of that side only, as copying it took both sides of each row', () => {
    for (const [selecting, kept, left] of [
      ['left', 0, 1],
      ['right', 1, 0],
    ] as const) {
      const view = rendered(
        createElement(
          'div',
          { className: 'diff-view side-by-side', 'data-selecting': selecting },
          splitLine('removed', 'added'),
        ),
      );
      const codes = allWithClass(view, 'split-code');
      looks(codes[kept], { 'user-select': undefined });
      looks(codes[left], { 'user-select': 'none' });
    }
  });

  test('places the shortcuts and the About by layout rather than a transform, which would place their edges between device pixels, a third of the room left above them and two thirds below, as a popup centered looks low, drawing the About like the shortcuts but narrower', () => {
    for (const popup of [shortcutsPopup(), aboutPopup()]) {
      const dialog = withClass(popup, 'shortcuts-popup');
      looks(dialog, {
        transform: undefined,
        translate: undefined,
        position: undefined,
        flex: 'none',
        'max-height': '100%',
      });
      const backdrop = dialog?.parent;
      assert.ok(backdrop);
      looks(backdrop, {
        display: 'flex',
        'flex-direction': 'column',
        'align-items': 'center',
        'box-sizing': 'border-box',
      });
      const before = { pseudoElement: '::before' };
      looks(backdrop, { content: "''" }, before);
      looks(backdrop, { content: "''" }, after);
      assert.strictEqual(
        Number(cascaded(backdrop, 'flex-grow', after)),
        2 * Number(cascaded(backdrop, 'flex-grow', before)),
      );
    }
    const shortcuts = widthCap(withClass(shortcutsPopup(), 'shortcuts-popup'));
    const about = widthCap(withClass(aboutPopup(), 'about-popup'));
    assert.strictEqual(about.room, shortcuts.room);
    assert.ok(about.cap < shortcuts.cap);
  });

  test('dims the whole window behind the shortcuts and the About with a backdrop that takes the pointer from the app, under them', () => {
    for (const popup of [shortcutsPopup(), aboutPopup()]) {
      const backdrop = popup.parent;
      assert.ok(backdrop?.classes.includes('backdrop'));
      looks(backdrop, {
        position: 'fixed',
        inset: '0',
        background: 'var(--backdrop)',
        'pointer-events': undefined,
      });
    }
    assert.strictEqual(bodyVariable('backdrop'), 'rgba(0, 0, 0, 0.2)');
  });

  test('keeps the shortcuts and the About from dragging the window when moved over the tab row, which does', () => {
    for (const popup of [shortcutsPopup(), aboutPopup()]) {
      looks(withClass(popup, 'shortcuts-popup'), {
        '-webkit-app-region': 'no-drag',
      });
    }
  });

  test("heads the shortcuts and the About with a band in the window's grey, holding their title in line with what follows and their close button as far in from the side as from the top, rounded with the popup's top corners and set apart from what follows, which both pad alike, the line under the pinned shortcuts reaching across the popup", () => {
    const groups = withClass(shortcutsPopup(), 'shortcuts-groups');
    looks(groups, { padding: '0 16px 16px' });
    const inside = paddingOf(groups);
    for (const popup of [shortcutsPopup(), aboutPopup()]) {
      const header = withClass(popup, 'shortcuts-title');
      looks(header, {
        background: 'var(--color-background)',
        'border-radius': 'var(--card-radius) var(--card-radius) 0 0',
      });
      const padding = paddingOf(header);
      assert.strictEqual(padding.left, inside.left);
      assert.deepStrictEqual(
        [padding.right, padding.bottom],
        [padding.top, padding.top],
      );
      assert.ok(withClass(header, 'nav-button'));
    }
    const pinned = withClass(shortcutsPopup(), 'shortcuts-pinned');
    const reach = sidesOf(pinned, 'margin');
    const room = paddingOf(pinned);
    assert.deepStrictEqual(
      [reach.left, reach.right, room.left, room.right],
      [`-${inside.left}`, `-${inside.right}`, inside.left, inside.right],
    );
    looks(pinned, {
      'border-bottom': cascaded(
        withClass(shortcutsPopup(), 'shortcuts-note'),
        'border-top',
      ),
    });
    const heading = paddingOf(withClass(shortcutsPopup(), 'shortcuts-heading'));
    assert.deepStrictEqual(paddingOf(withClass(aboutPopup(), 'about-body')), {
      ...inside,
      top: heading.top,
    });
  });

  test("tints the About's copy button more on hovering, and fills it with the focus color while pressed and once it copied", () => {
    const copy = withClass(aboutPopup(), 'about-copy');
    looks(copy, { background: 'var(--color-background)' });
    looks(copy, { background: 'var(--selection-background)' }, hovered);
    const filled = {
      color: 'var(--color-focus-foreground)',
      background: 'var(--color-focus)',
    };
    looks(copy, filled, { active: true });
    looks(
      withClass(
        rendered(createElement(CopyButton, { copied: true, onClick: noop })),
        'about-copy',
      ),
      filled,
    );
  });

  test('keeps a context menu within the window, scrolling one taller than it, as the repositories may be, unless it opens submenus, which scrolling would cut off', () => {
    looks(withClass(contextMenu(), 'context-menu'), {
      'box-sizing': 'border-box',
      'max-height': '100vh',
      'overflow-y': 'auto',
    });
    looks(
      withClass(
        rendered(
          createElement(ContextMenu, {
            menu: {
              x: 0,
              y: 0,
              items: [{ label: 'Bookmark', submenu: [{ label: 'main' }] }],
            },
            onClose: noop,
          }),
        ),
        'context-menu',
      ),
      { 'max-height': undefined, 'overflow-y': undefined },
    );
  });

  test('keeps the notices within the window, scrolling a long message within its notice, so a checkout listing hundreds of files leaves its close button in reach', () => {
    const shown = notices();
    looks(withClass(shown, 'notices'), {
      'box-sizing': 'border-box',
      bottom: '0',
      'overflow-y': 'auto',
    });
    const message = withClass(shown, 'notice-message');
    looks(message, { 'overflow-y': 'auto' });
    assert.ok(cascaded(message, 'max-height'));
  });

  test('draws a notice like a context menu, but on a background of its own, so it stands apart from the panels it floats over, and with twice the room around its message, as it is read rather than scanned', () => {
    const menu = contextMenu();
    for (const level of ['info', 'error']) {
      const shown = notices(level);
      looks(
        withClass(shown, 'notice'),
        Object.fromEntries(
          ['border-radius', 'box-shadow'].map((property) => [
            property,
            cascaded(menu, property),
          ]),
        ),
      );
      looks(withClass(shown, 'notice'), {
        background: 'var(--color-notice-background)',
        padding: `${2 * parseFloat(cascaded(menu, 'padding') ?? '')}px`,
        border: undefined,
        'border-left': undefined,
      });
      looks(withClass(shown, 'notice-message'), {
        padding: '6px 0 6px 12px',
      });
    }
  });

  test("sets a notice's close button in as far as the message's first line, as it is shorter than the message's padding and line", () => {
    const shown = notices();
    const message = withClass(shown, 'notice-message');
    const close = withClass(shown, 'notice-close');
    assert.ok(message && close);
    const marginTop = (cascaded(close, 'margin') ?? '0').split(' ')[0];
    assert.strictEqual(
      Number.parseInt(marginTop) + 2,
      Number.parseInt(paddingOf(message).top),
    );
    looks(close, { height: '20px' });
  });

  test('centers the notices under the column titles, or under the text saying no repository is open, so they show near the controls rather than in a far corner', () => {
    looks(withClass(notices(), 'notices'), {
      position: 'fixed',
      top: 'anchor(--notices bottom, 0px)',
      left: '0',
      right: '0',
      'flex-direction': 'column',
      'align-items': 'center',
    });
    looks(withClass(notices(), 'notice'), { 'box-sizing': 'border-box' });
    assert.ok(cascaded(withClass(notices(), 'notice'), 'max-width'));
    for (const anchor of [
      commitColumnTitle(0),
      rendered(createElement('div', { className: 'empty-state' })),
    ]) {
      looks(anchor, { 'anchor-name': '--notices' });
    }
  });

  test('pads the notices for the shadow of a popup, which their scrolling would clip, keeping them 16px from the bottom of the window', () => {
    const shadows = [
      ...(bodyVariable('popup-shadow') ?? '').matchAll(
        /(?<!inset )0 (\d+)px (\d+)px rgba/g,
      ),
    ].map(([, y, blur]) => ({ y: Number(y), blur: Number(blur) }));
    assert.ok(shadows.length > 0);
    const container = withClass(notices(), 'notices');
    assert.ok(container);
    const padding = paddingOf(container);
    assert.ok(
      Number.parseInt(padding.top) >=
        Math.max(...shadows.map((s) => s.blur - s.y)),
    );
    for (const side of [padding.left, padding.right]) {
      assert.ok(
        Number.parseInt(side) >= Math.max(...shadows.map((s) => s.blur)),
      );
    }
    assert.strictEqual(padding.bottom, '16px');
  });

  test('draws an error notice like any other notice but for the color of its message', () => {
    assert.deepStrictEqual(
      matchingRules(withClass(notices(), 'notice')).map(
        (rule) => rule.selector,
      ),
      ['.notice'],
    );
    const rules = matchingRules(withClass(notices(), 'notice-message'));
    assert.strictEqual(rules.at(-1)?.selector, '.notice.error .notice-message');
    assert.deepStrictEqual(
      [...(rules.at(-1)?.declarations.entries() ?? [])],
      [['color', 'var(--color-error-foreground)']],
    );
    looks(withClass(notices('info'), 'notice-message'), { color: undefined });
  });

  test('strikes a deleted file through, in the text color like the other changes', () => {
    looks(withClass(fileRow(fileChange('src/a.ts', { status: 'D' })), 'path'), {
      'text-decoration': 'line-through',
      color: undefined,
    });
  });

  test('starts a changed file with its icon, spaced from its name, in the theme color of its kind', () => {
    for (const [status, kind] of [
      ['A', 'added'],
      ['M', 'modified'],
      ['D', 'deleted'],
      ['R', 'renamed'],
    ] as const) {
      const icon = withClass(
        fileRow(fileChange('src/a.ts', { status })),
        'change-icon',
        kind,
      );
      looks(icon, { color: `var(--color-${kind})`, 'flex-shrink': '0' });
      assert.ok(parseFloat(cascaded(icon, 'margin-right') ?? '') > 0);
    }
  });

  test('sizes all text by the font size settings, or a multiple of them for the headings of Markdown, buttons and inputs included', () => {
    const sizes = [...css.matchAll(/font-size: ([^;]+);/g)].map(
      (match) => match[1],
    );
    assert.deepStrictEqual(
      [...new Set(sizes.filter((size) => !size.startsWith('calc(')))],
      ['var(--font-size)', 'var(--monospace-font-size)'],
    );
    for (const scaled of sizes.filter((size) => size.startsWith('calc('))) {
      assert.match(scaled, /^calc\(var\(--font-size\) \* [\d.]+\)$/);
    }
    const controls = [
      tabBar(),
      contextMenu(),
      locationsPopup(''),
      diffFind(),
      notices(),
      searchButton(),
      rendered(navButtons()),
    ].flatMap((root) =>
      allWithClass(root).filter((element) =>
        ['button', 'input'].includes(element.tag),
      ),
    );
    assert.ok(controls.length > 10);
    for (const control of controls) {
      looks(control, { font: 'inherit' });
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

  test('keeps the arrow cursor of a desktop app but for resizing, the fields showing the text cursor of their own', () => {
    assert.deepStrictEqual(
      [
        ...new Set(
          [...css.matchAll(/cursor: ([^;]+);/g)].map((match) => match[1]),
        ),
      ],
      ['col-resize'],
    );
  });

  test('mutes text by the one muted opacity, from the text color', () => {
    assert.strictEqual(
      bodyVariable('muted-opacity'),
      'var(--color-foreground-muted)',
    );
    assert.strictEqual(
      bodyVariable('muted-foreground'),
      'color-mix( in srgb, var(--color-foreground) var(--color-foreground-muted), transparent )',
    );
    looks(withClass(rendered(commitRow()), 'commit-line', 'secondary'), {
      color: 'var(--muted-foreground)',
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

  test('dims close buttons, disabled controls and a gone bubble like muted text, keeping its own fade only for the loading placeholder', () => {
    for (const dimmed of [
      withClass(notices(), 'notice-close'),
      withClass(locationsPopup(''), 'badge', 'missing'),
      allWithClass(contextMenu(), 'menu-item').find((item) =>
        item.attributes.has('disabled'),
      ),
      allWithClass(rendered(navButtons()), 'nav-button').find((button) =>
        button.attributes.has('disabled'),
      ),
    ]) {
      looks(dimmed, { opacity: 'var(--muted-opacity)' });
    }
    const fades = [...css.matchAll(/opacity: (0\.\d+);/g)].map(
      (match) => match[1],
    );
    assert.strictEqual(fades.length, 1);
    looks(withClass(skeletonRow(), 'bar'), { opacity: fades[0] });
  });

  test('highlights what a search matched in the search match colors', () => {
    const matches = allWithClass(locationsPopup('m'), 'match');
    assert.ok(matches.length > 1);
    for (const match of matches) {
      looks(match, {
        color: 'var(--color-search-match-foreground)',
        background: 'var(--color-search-match)',
      });
    }
  });

  test('highlights what a find in the diff matched in the search match colors, edging the current match, and ticks the minimap in them', () => {
    const [match, current] = allWithClass(
      diffView(
        {},
        inlineLine('context', {
          finds: [
            { start: 0, end: 1 },
            { start: 2, end: 3 },
          ],
          current: { start: 2, end: 3 },
        }),
      ),
      'find-match',
    );
    const colors = {
      color: 'var(--color-search-match-foreground)',
      background: 'var(--color-search-match)',
    };
    looks(match, { ...colors, 'box-shadow': undefined });
    looks(current, {
      ...colors,
      'box-shadow': '0 0 0 1px var(--color-search-match-foreground)',
    });
    assert.ok(current.classes.includes('current'));
    looks(withClass(minimap(), 'minimap-mark', 'match'), {
      background: 'var(--color-search-match)',
    });
  });

  test('draws the find field like the resting search field, edged in the focus color while typing in it', () => {
    const resting = withClass(locationsPopup(''), 'locations-search');
    looks(diffFind(), {
      background: cascaded(resting, 'background'),
      border: cascaded(resting, 'border'),
    });
    for (const field of [diffFind(), diffFind('a')]) {
      looks(
        field,
        { 'border-color': 'var(--color-focus)' },
        { focus: withClass(field, 'diff-find-input') },
      );
    }
  });

  test('keeps the title of the Files column clear of its three buttons on the left, spaces the buttons of the Diff column alike, and never squeezes the search field out', () => {
    const files = columnTitle(
      createElement('div', { className: 'nav-buttons all-files' }),
    );
    assert.strictEqual(
      pixels(cascaded(files, 'padding-left')),
      buttonsWidth(3),
    );
    const gap = cascaded(withClass(files, 'nav-buttons'), 'gap');
    assert.ok(gap);
    const diff = columnTitle(diffOptions());
    for (const group of [
      withClass(diff, 'nav-buttons'),
      withClass(diff, 'segmented'),
      withClass(diff, 'pin-pair'),
    ]) {
      looks(group, { gap, border: undefined, padding: undefined });
    }
    assert.ok(parseFloat(cascaded(diffFind(), 'min-width') ?? '') > 0);
  });

  test('keeps the title of the Files column on one line after its buttons, centered while it fits beside the room they take mirrored on the right, then cut off with an ellipsis', () => {
    const title = withClass(
      rendered(
        renderedBy(Column, {
          title: '0123456 → 89abcde',
          start: createElement('div', { className: 'nav-buttons all-files' }),
          children: null,
        }),
      ),
      'column-title',
    );
    looks(withClass(title, 'column-name'), {
      flex: 'none',
      'max-width': '100%',
      overflow: 'hidden',
      'white-space': 'nowrap',
      'text-overflow': 'ellipsis',
    });
    assert.strictEqual(
      pixels(cascaded(title, 'width', after)) +
        parseFloat(cascaded(title, 'padding-right') ?? ''),
      pixels(cascaded(title, 'padding-left')),
    );
  });

  test('fills a pinned pair as one undimmed switched-on toggle, its buttons unfilled, and fills the layout buttons as one pill, lifting the chosen and the hovered one onto the panel inside it', () => {
    const pinned = rendered(diffOptions({ pinned: true }));
    const pair = withClass(pinned, 'pin-pair');
    looks(pair, { background: 'var(--toggle-on-background)' });
    const [entire, pin] = allWithClass(pair, 'nav-button', 'active');
    assert.ok(entire.attributes.has('disabled'));
    looks(entire, { opacity: '1', background: 'none' });
    looks(pin, { background: 'none' });
    const fetching = withClass(
      rendered(navButtons({ autoFetch: true, autoFetchMinutes: 5 })),
      'pin-pair',
    );
    assert.ok(fetching.classes.includes('pinned'));
    for (const button of allWithClass(fetching, 'nav-button')) {
      looks(button, { background: 'none' });
    }
    looks(withClass(pinned, 'segmented'), {
      background: 'var(--button-background)',
      'box-shadow': undefined,
    });
    for (const button of [
      entire,
      pin,
      ...allWithClass(
        withClass(rendered(diffOptions()), 'pin-pair'),
        'nav-button',
      ),
    ]) {
      looks(button, { color: 'var(--color-foreground)' });
    }
    const [chosen, other] = allWithClass(
      withClass(pinned, 'segmented'),
      'nav-button',
    );
    assert.ok(chosen.classes.includes('active'));
    looks(chosen, {
      background:
        'linear-gradient(var(--toggle-on-background), var(--toggle-on-background)), var(--color-panel-background)',
    });
    looks(other, { background: 'none' });
    looks(other, { background: 'var(--color-panel-background)' }, hovered);
  });

  test('divides the two sides with one line from top to bottom, across headers and hunk gaps, letting the pointer through', () => {
    const view = diffView({ sideBySide: true }, splitLine('', ''));
    looks(
      view,
      {
        content: "''",
        position: 'absolute',
        top: '0',
        bottom: '0',
        left: '50%',
        width: '1px',
        background: 'var(--color-border)',
        'pointer-events': 'none',
      },
      after,
    );
    const [left, right] = allWithClass(shownRow(view), 'split-side').map(
      (side) => matchingRules(side).map((rule) => rule.selector),
    );
    assert.deepStrictEqual(right, left);
  });

  test('stripes the empty side of a change in the border color, in square tiles so the stripes run on from tile to tile, shifting the stripes of each row up by how far down it is, so they make one pattern across rows however tall the lines', () => {
    const filler =
      cascaded(
        withClass(
          diffView({ sideBySide: true }, splitLine('filler', 'added')),
          'split-side',
          'filler',
        ),
        'background',
      ) ?? '';
    assert.match(filler, /linear-gradient\( -45deg, var\(--color-border\)/);
    const tile =
      /\) 0 calc\(-1 \* var\(--diff-row-top, 0px\)\) \/ (\S+) (\S+)$/.exec(
        filler,
      );
    assert.ok(tile);
    assert.strictEqual(tile[1], tile[2]);
  });

  test('draws no focus outline around the commit list, whose selected row shows where the keys go', () => {
    const list = rendered(
      createElement('div', {
        className: 'virtual-rows list',
        [columnFocusAttribute]: '',
      }),
    );
    for (const states of [{}, focused]) {
      looks(list, { outline: 'none' }, states);
    }
  });

  test('keeps the search fields clear of the active column edge, the title holding both fields at one height', () => {
    const column = rendered(renderedBy(Column, { children: null }));
    const px = (name: string) => {
      const match = /^(\d+)px$/.exec(cascaded(column, `--${name}`) ?? '');
      assert.ok(match, name);
      return Number(match[1]);
    };
    const edge = parseFloat(activeEdge());
    const line = parseFloat(
      cascaded(withClass(column, 'column-title'), 'border-bottom') ?? '',
    );
    const above = (px('title-height') - line - px('search-height')) / 2;
    assert.ok(above - edge >= 2, String(above));
    for (const field of [
      diffFind(),
      withClass(locationsPopup(''), 'locations-search'),
    ]) {
      looks(field, { height: 'var(--search-height)' });
    }
    looks(withClass(searchButton(), 'search-button'), {
      width: 'var(--search-height)',
      height: 'var(--search-height)',
      'border-radius': 'calc(var(--search-height) / 2)',
    });
  });

  test('gives the keys of every shortcut group the same share of the width, wrapping a long list of them, so the actions line up', () => {
    const lists = allWithClass(shortcutsPopup(), 'shortcuts-list');
    const share = cascaded(lists[0], 'grid-template-columns');
    assert.match(share ?? '', /^[\d.]+% 1fr$/);
    for (const list of lists) {
      looks(list, { 'grid-template-columns': share });
    }
    for (const keys of allWithClass(shortcutsPopup(), 'shortcut-keys')) {
      looks(keys, { 'flex-wrap': 'wrap' });
    }
  });

  test('sets the note about the keys working everywhere apart under the shortcuts, muted, kept in view as they scroll', () => {
    looks(withClass(shortcutsPopup(), 'shortcuts-note'), {
      flex: 'none',
      color: 'var(--muted-foreground)',
      'border-top': '1px solid var(--color-border)',
    });
  });

  test('draws the shortcuts over the notices and menus, but under the overlay scrollbars', () => {
    const backdrop = shortcutsPopup().parent;
    assert.ok(backdrop);
    const shortcuts = layer(backdrop);
    for (const below of [contextMenu(), historyMenu(), notices()]) {
      assert.ok(shortcuts > layer(below), below.classes.join(' '));
    }
    assert.ok(layer(overlayScrollbar()) > shortcuts);
  });

  test('draws the active column edge over the search popup that covers the column, but under menus and notices', () => {
    const edge = layer(
      withClass(columns(columnsClass(true, 'a'), 'commits'), 'column'),
      after,
    );
    assert.ok(edge > layer(locationsPopup('')));
    for (const above of [contextMenu(), historyMenu(), notices()]) {
      assert.ok(layer(above) > edge, above.classes.join(' '));
    }
  });

  test("hides the overlay scrollbars while a commit's whole message is peeked at, as they are drawn over everything and would cut through it, but not while one is pinned, which scrolls with them", () => {
    looks(shownScrollbar('message-peek'), { opacity: '0' });
    looks(shownScrollbar('message-peek pinned'), { opacity: '1' });
    looks(shownScrollbar(), { opacity: '1' });
  });

  test('puts the pin and the keys pinning a message peeked at, or the button closing a pinned one, beside the subject at the top right, on its first line and muted like the author, the keys drawn like the shortcuts screen draws them', () => {
    const rowLine = cascaded(
      withClass(rendered(commitRow()), 'commit-line'),
      'height',
    );
    const corner = withClass(messagePanel(), 'message-corner');
    looks(corner, {
      flex: 'none',
      'align-self': 'flex-start',
      display: 'grid',
      'align-items': 'center',
      height: rowLine,
      color: 'var(--muted-foreground)',
      'font-size': 'calc(var(--font-size) * 0.85)',
    });
    looks(withClass(corner, 'message-hint'), {
      'grid-area': '1 / 1',
      display: 'flex',
      'align-items': 'center',
    });
    const shortcutKey = keyOf(shortcutsPopup());
    const cornerKey = keyOf(corner);
    assert.ok(shortcutKey && cornerKey);
    for (const property of ['border', 'border-radius', 'padding']) {
      assert.strictEqual(
        cascaded(cornerKey, property),
        cascaded(shortcutKey, property),
        property,
      );
    }
    const close = withClass(messagePanel({}, true), 'message-close');
    looks(close, {
      'grid-area': '1 / 1',
      'justify-self': 'end',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      width: rowLine,
      height: rowLine,
      padding: '0',
      color: 'inherit',
      background: 'none',
      border: 'none',
    });
    looks(close, { background: 'var(--hover-background)' }, hovered);
  });

  test("keeps the corner of a message as wide pinned as peeked at, stacking the pin hint and the close button in one place and hiding whichever doesn't apply, so pinning doesn't change the width", () => {
    const peeked = messagePanel();
    const pinned = messagePanel({}, true);
    looks(withClass(peeked, 'message-hint'), { visibility: undefined });
    looks(withClass(peeked, 'message-close'), { visibility: 'hidden' });
    looks(withClass(pinned, 'message-hint'), { visibility: 'hidden' });
    looks(withClass(pinned, 'message-close'), { visibility: undefined });
  });

  test('cuts the rest of a message peeked at through the middle of its third line, the half line showing there is more, and shows all of it once pinned', () => {
    const rowLine = cascaded(
      withClass(rendered(commitRow()), 'commit-line'),
      'height',
    );
    looks(withClass(messagePanel(), 'message-body'), {
      'max-height': `calc(2.5 * ${rowLine})`,
      overflow: 'hidden',
    });
    looks(withClass(messagePanel({}, true), 'message-body'), {
      'max-height': undefined,
      overflow: undefined,
    });
  });

  test('tells how many lines are cut off a message peeked at in small muted type, like the hint at its corner', () => {
    const rowLine = cascaded(
      withClass(rendered(commitRow()), 'commit-line'),
      'height',
    );
    const corner = withClass(messagePanel(), 'message-corner');
    looks(rendered(createElement('div', { className: 'message-more' })), {
      'line-height': rowLine,
      color: cascaded(corner, 'color'),
      'font-size': cascaded(corner, 'font-size'),
    });
  });

  test('lets a pinned message take the pointer, its text be selected, and a long one scroll its rest alone, keeping its subject, author, bubbles and close button in place, without scrolling on past its end, its ring and shadow letting the pointer through to the row', () => {
    looks(messagePanel({}, true), {
      'pointer-events': 'auto',
      'user-select': 'text',
    });
    for (const pseudoElement of ['::before', '::after']) {
      looks(
        messagePanel({}, true),
        { 'pointer-events': 'none' },
        { pseudoElement },
      );
    }
    const pinned = messagePanel(
      { refs: [{ kind: 'branch', name: 'main', commit: 'a' }] },
      true,
    );
    looks(withClass(pinned, 'commit'), {
      display: 'flex',
      'flex-direction': 'column',
      overflow: 'hidden',
      'overflow-y': undefined,
    });
    for (const kept of ['commit-line', 'bubble-line']) {
      looks(withClass(pinned, kept), { 'flex-shrink': '0' });
    }
    looks(withClass(pinned, 'message-body'), {
      'flex-shrink': undefined,
      'min-height': '0',
      'overflow-y': 'auto',
      'overscroll-behavior': 'contain',
    });
    looks(messagePanel(), {
      'pointer-events': 'none',
      'user-select': undefined,
    });
    looks(withClass(messagePanel(), 'commit'), { display: undefined });
    looks(withClass(messagePanel(), 'message-body'), {
      'overflow-y': undefined,
    });
  });

  test("draws a commit's whole message over the edges of the columns, but under the notices and menus", () => {
    const edge = layer(
      withClass(columns(columnsClass(true, 'a'), 'commits'), 'column'),
      after,
    );
    const message = layer(messagePanel());
    assert.ok(message > edge);
    for (const above of [contextMenu(), historyMenu(), notices()]) {
      assert.ok(layer(above) > message, above.classes.join(' '));
    }
  });

  test('draws a menu, a context menu and so their submenus over the notices, which take the pointer only on a notice, and both under the overlay scrollbars', () => {
    assert.strictEqual(cascaded(contextMenu(), 'position'), 'fixed');
    assert.ok(layer(contextMenu()) > layer(notices()));
    assert.ok(layer(historyMenu()) > layer(notices()));
    assert.ok(layer(overlayScrollbar()) > layer(contextMenu()));
    looks(notices(), { 'pointer-events': 'none' });
    looks(withClass(notices(), 'notice'), { 'pointer-events': 'auto' });
  });

  test('edges the active column in the focus color and the others in the border color, over their contents but letting the pointer through, and outlines nothing in them', () => {
    const names: readonly ColumnName[] = ['commits', 'files', 'diff'];
    for (const active of names) {
      const edges = allWithClass(
        columns(columnsClass(true, 'a'), active),
        'column',
      );
      for (const [index, name] of names.entries()) {
        const shown = name === active;
        looks(
          edges[index],
          {
            content: "''",
            position: 'absolute',
            'box-shadow': shown
              ? 'inset 0 0 0 2px var(--color-focus)'
              : 'inset 0 0 0 2px var(--color-border)',
            'pointer-events': 'none',
          },
          after,
        );
      }
    }
    const focusable = allWithClass(diffView({}, inlineLine('added'))).filter(
      (element) => element.attributes.has(columnFocusAttribute),
    );
    assert.strictEqual(focusable.length, 1);
    looks(focusable[0], { outline: 'none' }, focused);
  });

  test('mutes the search placeholders and the magnifier of the search button like other muted text', () => {
    looks(withClass(searchButton(), 'search-button'), {
      color: 'var(--muted-foreground)',
    });
    for (const field of [
      withClass(locationsPopup(''), 'locations-search'),
      withClass(diffFind(), 'diff-find-input'),
    ]) {
      looks(
        field,
        { color: 'var(--muted-foreground)' },
        { pseudoElement: '::placeholder' },
      );
    }
  });
});
