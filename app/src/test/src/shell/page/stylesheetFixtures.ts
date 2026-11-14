import * as assert from 'node:assert';
import { createElement } from 'react';
import {
  cascaded,
  rendered,
  withClass,
  type MarkupElement,
  type States,
} from '../../../helpers/cascade';
import { stylesheet } from '../../../helpers/fixtures';
import { columnTitle } from '../../../helpers/styleMarkup';

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

export function unwrapped(value: string | undefined): string {
  return (value ?? '')
    .replaceAll(/\(\s+/g, '(')
    .replaceAll(/\s+\)/g, ')')
    .replaceAll(/\s+/g, ' ');
}
