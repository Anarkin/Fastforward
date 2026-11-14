import * as assert from 'node:assert';
import { createElement } from 'react';
import { overlayScrollbarClass } from '../../../../lib/page/overlayScrollbars';
import {
  allWithClass,
  cascaded,
  matchingRules,
  rendered,
  withClass,
  type MarkupElement,
  type States,
} from '../../../helpers/cascade';
import { stylesheet } from '../../../helpers/fixtures';
import { bubbles, columnTitle } from '../../../helpers/styleMarkup';

export const css = stylesheet();

export function keyframe(name: string, at: string): string | undefined {
  return new RegExp(
    String.raw`@keyframes ${name} \{\s*${at} \{([^}]*)\}\s*\}`,
  ).exec(css)?.[1];
}

export const noop = () => undefined;

export function buttonsWidth(
  column: React.ReactElement,
  bare: React.ReactElement,
  count: number,
  side: 'left' | 'right' = 'left',
): number {
  const title = columnTitle(column);
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
  const clearance = paddingOf(columnTitle(bare))[side];
  return (
    parseFloat(edge ?? '') +
    count * parseFloat(button ?? '') +
    (count - 1) * parseFloat(gap ?? '') +
    parseFloat(clearance)
  );
}

export function activeEdge(columns: React.ReactElement): string {
  const edge = withClass(rendered(columns), 'column');
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

export function cell(row: MarkupElement, className: string): MarkupElement {
  return withClass(
    rendered(
      createElement('span', { className }, '😀'),
      withClass(row, 'code'),
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

export function appIconSpacing(tabBar: React.ReactElement) {
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

export function popupOf(popup: React.ReactElement): MarkupElement {
  return withClass(rendered(popup), 'shortcuts-popup');
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

export function divider(tab: MarkupElement): MarkupElement {
  return withClass(tab, 'tab-divider');
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

export function badgeRules(node: React.ReactNode): string[] {
  return matchingRules(withClass(rendered(node), 'badge')).map(
    (rule) => rule.selector,
  );
}

export function columnVisibility(columns: React.ReactElement) {
  return allWithClass(rendered(columns), 'column').map((column) =>
    cascaded(column, 'visibility'),
  );
}

export function unwrapped(value: string | undefined): string {
  return (value ?? '')
    .replaceAll(/\(\s+/g, '(')
    .replaceAll(/\s+\)/g, ')')
    .replaceAll(/\s+/g, ' ');
}

export const bubbleLook = ['color', 'background', 'box-shadow', 'border'];

export function branchBubble(sources: React.ReactElement): MarkupElement {
  const branch = bubbles(sources).find(
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

export function pathColors(
  pathTitle: React.ReactElement,
): (string | undefined)[] {
  const title = rendered(pathTitle);
  return [
    cascaded(title, 'color'),
    ...allWithClass(title, 'path-part').map((part) => cascaded(part, 'color')),
    cascaded(withClass(title, 'path-name'), 'color'),
  ];
}
