import * as assert from 'node:assert';
import { createElement } from 'react';
import { createGitStore, GitStore } from '../../../tools/git/page/store';
import { emptyTabView } from '../../../tools/git/page/tabView';
import { GraphCell } from '../../../tools/git/page/graph';
import { columnsClass } from '../../../tools/git/page/columns';
import {
  bubbleLineHeight,
  commitRowHeight,
  SoloButton,
} from '../../../tools/git/page/commitList';
import { AboutPopup } from '../../../shell/page/aboutPopup';
import { TabBar } from '../../../shell/page/tabBar';
import { overlayScrollbarClass } from '../../../lib/page/overlayScrollbars';
import { ShortcutsPopup } from '../../../shell/page/shortcutsPopup';
import { SkeletonRows } from '../../../lib/page/skeleton';
import { PathTitle } from '../../../tools/commander/page/pathTitle';
import { MarkBox } from '../../../tools/commander/page/pane';
import {
  allWithClass,
  cascaded,
  matchingRules,
  rendered,
  withClass,
  type MarkupElement,
  type States,
} from '../../support/cascade';
import { stylesheet } from '../../support/fixtures';
import { tabsStore } from '../../support/componentFixtures';
import {
  bubbles,
  columns,
  columnTitle,
  commitRow,
  diffRow,
  diffView,
  hangingSpacesLine,
  indentedLine,
  navButtons,
  shownRow,
  tabBar,
} from '../../support/styleFixtures';
import { createShellStore, ShellStore } from '../../../shell/page/store';
import { FileHeader, HunkDivider } from '../../../tools/git/page/diffRowParts';

export const css = stylesheet();

export function keyframe(name: string, at: string): string | undefined {
  return new RegExp(
    String.raw`@keyframes ${name} \{\s*${at} \{([^}]*)\}\s*\}`,
  ).exec(css)?.[1];
}

export const noop = () => undefined;

export function buttonsWidth(
  count: number,
  side: 'left' | 'right' = 'left',
): number {
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

export function activeEdge(): string {
  const edge = withClass(columns(columnsClass(true, 'a'), 'commits'), 'column');
  assert.strictEqual(
    cascaded(edge, 'box-shadow', after),
    'inset 0 0 0 var(--frame-line) var(--color-focus)',
  );
  assert.strictEqual(
    cascaded(edge, '--frame-line', after),
    'var(--column-line)',
  );
  const line = cascaded(edge, '--column-line') ?? '';
  return (
    /^round\((\d+px), var\(--device-pixel, 1px\)\)$/.exec(line)?.[1] ?? line
  );
}

export function indented(wordWrap: boolean): MarkupElement {
  return shownRow(diffView({ wordWrap }, indentedLine()));
}

export function cell(className: string): MarkupElement {
  return withClass(
    rendered(
      createElement('span', { className }, '😀'),
      withClass(indented(true), 'code'),
    ),
    'cell',
  );
}

export const spaceDots =
  'linear-gradient(to right, transparent var(--space-dot-start), var(--muted-foreground) var(--space-dot-start) calc(var(--space-dot-start) + var(--space-dot)), transparent 0)';

export const squareDots = {
  'background-size': 'var(--text-advance) var(--space-dot)',
  'background-position': '0 50%',
  'background-repeat': 'repeat-x',
};

export const spaceDotSize =
  'max(var(--device-pixel, 1px), round(0.16em, var(--device-pixel, 1px)))';

export const spaceDotStart =
  'round(down, (var(--text-advance) - var(--space-dot)) / 2, var(--device-pixel, 1px))';

export function hanging(showWhitespace: boolean): MarkupElement {
  return withClass(
    shownRow(diffView({ wordWrap: true, showWhitespace }, hangingSpacesLine())),
    'wrap-spaces',
  );
}

export function pixels(value: string | undefined): number {
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

export const compact = (value: string | undefined) =>
  value?.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');

export function looks(
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

export function looksAlike(
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

export const body = rendered(createElement('body'));

export function checkBox(checked: boolean): MarkupElement {
  return rendered(
    createElement('input', { type: 'checkbox', checked, readOnly: true }),
  );
}

export function graphBesideCommit(selected?: string): MarkupElement {
  return rendered(
    createElement(
      'div',
      { className: 'virtual-row' },
      createElement(GraphCell, {
        row: { lane: 0, color: 0, lines: [] },
        height: commitRowHeight,
        line: bubbleLineHeight,
        onToggleMerge: noop,
      }),
      commitRow({ selected }),
    ),
  );
}

export function bodyVariable(name: string): string | undefined {
  return cascaded(body, `--${name}`);
}

export function sidesOf(element: MarkupElement, property: string) {
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

export function lengthOf(value: string | undefined): number {
  const resolved = (value ?? '')
    .replace(/env\([\w-]+, ([^)]*)\)/g, '$1')
    .replace(
      /var\(--([\w-]+)\)/g,
      (_, name: string) => bodyVariable(name) ?? '',
    );
  const sum = /^calc\((.*)\)$/s.exec(resolved.trim())?.[1] ?? resolved;
  return sum
    .trim()
    .split(/\s+(?=[+-]\s)/)
    .map((term) => {
      const sign = term.startsWith('- ') ? -1 : 1;
      return (
        sign *
        term
          .replace(/^[+-]\s+/, '')
          .split('*')
          .map((factor) => parseFloat(factor))
          .reduce((product, factor) => product * factor, 1)
      );
    })
    .reduce((total, term) => total + term, 0);
}

export function appIconSpacing() {
  const bar = tabBar();
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

export function paddingOf(element: MarkupElement) {
  return sidesOf(element, 'padding');
}

export function halved(length: string | undefined): string {
  return length?.startsWith('var(') === true
    ? `calc(${length} / 2)`
    : `${parseFloat(length ?? '') / 2}px`;
}

export function deviceRounded(name: string): number {
  const match = /^round\((\d+)px, var\(--device-pixel, 1px\)\)$/.exec(
    bodyVariable(name) ?? '',
  );
  assert.ok(match, name);
  return Number(match[1]);
}

export function layer(element: MarkupElement, states?: States): number {
  return Number(cascaded(element, 'z-index', states));
}

export const hovered = { hover: true } as const;
export const focused = { focus: true } as const;
export const after = { pseudoElement: '::after' };

export function commitColumnTitle(autoFetchMinutes: number): MarkupElement {
  return columnTitle(navButtons({ autoFetchMinutes }));
}

export function aboutPopup(): MarkupElement {
  return withClass(
    rendered(
      createElement(
        ShellStore,
        {
          value: createShellStore(noop, {
            about: {
              version: '1.0.0',
              development: false,
              git: '2.52.0',
              system: 'Linux 6.8.0, x64',
            },
          }),
        },
        createElement(AboutPopup),
      ),
    ),
    'shortcuts-popup',
  );
}

export function tabStrip(
  maximized: boolean,
  overflowing: boolean,
): MarkupElement {
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

export function tabBarIn(maximized: boolean, adding = false): MarkupElement {
  return rendered(
    createElement(
      'div',
      maximized ? { 'data-maximized': '' } : {},
      createElement(
        ShellStore,
        {
          value: tabsStore(
            [
              { id: '/a', tool: 'git', root: '/a', name: 'a' },
              { id: '/b', tool: 'git', root: '/b', name: 'b' },
            ],
            '/a',
            adding,
          ),
        },
        createElement(TabBar, {}),
      ),
    ),
  );
}

export function tabRow(count: number, active: string): MarkupElement {
  return rendered(
    createElement(
      ShellStore,
      {
        value: tabsStore(
          ['a', 'b', 'c'].slice(0, count).map((name) => ({
            id: `/${name}`,
            tool: 'git' as const,
            root: `/${name}`,
            name,
          })),
          active,
        ),
      },
      createElement(TabBar, {}),
    ),
  );
}

export function divider(tab: MarkupElement): MarkupElement {
  return withClass(tab, 'tab-divider');
}

export function shortcutsPopup(): MarkupElement {
  return withClass(
    rendered(
      createElement(
        ShellStore,
        {
          value: tabsStore([{ id: '1', tool: 'git', name: 'repo' }], '1'),
        },
        createElement(ShortcutsPopup),
      ),
    ),
    'shortcuts-popup',
  );
}

export function overlayScrollbar(classes = ''): MarkupElement {
  return rendered(
    createElement('div', {
      className: `${overlayScrollbarClass} vertical ${classes}`,
    }),
  );
}

export function keyOf(element: MarkupElement): MarkupElement | undefined {
  return element.tag === 'kbd'
    ? element
    : element.children.map(keyOf).find((key) => key !== undefined);
}

export function shownScrollbar(message?: string): MarkupElement {
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

export function skeletonRow(className?: string): MarkupElement {
  return withClass(
    rendered(createElement(SkeletonRows, { count: 1, className })),
    'skeleton-row',
  );
}

export function soloButton(solo: boolean, applying: boolean): MarkupElement {
  return rendered(
    createElement(
      GitStore,
      {
        value: createGitStore(noop, {
          solo,
          tab: { ...emptyTabView, applyingSolo: applying },
        }),
      },
      createElement(SoloButton),
    ),
  );
}

export function badgeRules(node: React.ReactNode): string[] {
  return matchingRules(withClass(rendered(node), 'badge')).map(
    (rule) => rule.selector,
  );
}

export function hunkDots(sideBySide: boolean): MarkupElement {
  return withClass(
    diffView({ sideBySide }, diffRow(createElement(HunkDivider))),
    'hunk-dots',
  );
}

export const fileHeader = diffRow(
  createElement(FileHeader, {
    path: 'a',
    open: true,
    whole: false,
    collapsible: true,
    onClick: noop,
  }),
);

export function columnVisibility(
  selected: string | undefined,
  diffShown = true,
) {
  return allWithClass(
    columns(columnsClass(true, selected, diffShown)),
    'column',
  ).map((column) => cascaded(column, 'visibility'));
}

export function unwrapped(value: string | undefined): string {
  return (value ?? '')
    .replaceAll(/\(\s+/g, '(')
    .replaceAll(/\s+\)/g, ')')
    .replaceAll(/\s+/g, ' ');
}

export const bubbleLook = ['color', 'background', 'box-shadow', 'border'];

export function branchBubble(): MarkupElement {
  const branch = bubbles().find(
    (bubble) =>
      bubble.classes.includes('branch') &&
      !bubble.classes.includes('checked-out'),
  );
  assert.ok(branch);
  return branch;
}

export function widthCap(popup: MarkupElement): { cap: number; room: string } {
  const width = /^min\(([\d.]+)px, (.+)\)$/.exec(
    cascaded(popup, 'width') ?? '',
  );
  assert.ok(width);
  return { cap: Number(width[1]), room: width[2] };
}

export function tagHoleReach(tag: MarkupElement): number {
  const hole =
    /^radial-gradient\(circle at calc\(100% - ([\d.]+)px\) 50%, transparent [\d.]+px, var\(--color-git-bubble\) ([\d.]+)px\)$/.exec(
      unwrapped(cascaded(tag, 'background')),
    );
  assert.ok(hole);
  return Number(hole[1]) + Number(hole[2]);
}

export function commanderIconDisplay(className: string): string | undefined {
  const icon = rendered(
    createElement(
      'span',
      { className: 'commander-icon' },
      createElement('img', { className }),
    ),
  );
  return cascaded(withClass(icon, 'system-icon'), 'display');
}

export function commanderRowColor(className: string): string | undefined {
  return cascaded(
    rendered(
      createElement('div', { className: `row commander-row ${className}` }),
    ),
    'color',
  );
}

export function commanderItem(
  className: string,
  paneClassName = '',
): MarkupElement {
  return withClass(
    rendered(
      createElement(
        'div',
        { className: `commander ${paneClassName}` },
        createElement(
          'div',
          { className: `row commander-row ${className}` },
          createElement(MarkBox, { onToggle: noop }),
        ),
      ),
    ),
    'commander-row',
  );
}

export function pathColors(
  hidden: readonly boolean[],
  color?: string,
): (string | undefined)[] {
  const title = rendered(
    createElement(PathTitle, { path: 'C:/cache/notes.txt', hidden, color }),
  );
  return [
    cascaded(title, 'color'),
    ...allWithClass(title, 'path-part').map((part) => cascaded(part, 'color')),
    cascaded(withClass(title, 'path-name'), 'color'),
  ];
}
