import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { stylesheet } from './fixtures';

export interface MarkupElement {
  readonly tag: string;
  readonly attributes: ReadonlyMap<string, string>;
  readonly classes: readonly string[];
  readonly parent: MarkupElement | undefined;
  readonly children: MarkupElement[];
}

export interface States {
  readonly hover?: true | MarkupElement;
  readonly focus?: true | MarkupElement;
  readonly pseudoElement?: string;
}

interface Context {
  readonly hovered: ReadonlySet<MarkupElement>;
  readonly focused: MarkupElement | undefined;
  readonly focusedWithin: ReadonlySet<MarkupElement>;
}

function selfAndAncestors(element: MarkupElement | undefined): MarkupElement[] {
  const all: MarkupElement[] = [];
  for (let current = element; current; current = current.parent) {
    all.push(current);
  }
  return all;
}

function contextOf(element: MarkupElement, states: States): Context {
  const target = (state: true | MarkupElement | undefined) =>
    state === true ? element : state;
  const focused = target(states.focus);
  return {
    hovered: new Set(selfAndAncestors(target(states.hover))),
    focused,
    focusedWithin: new Set(selfAndAncestors(focused)),
  };
}

function split(text: string, separator: string): string[] {
  const parts = [''];
  let depth = 0;
  for (const char of text) {
    depth += Number('(['.includes(char)) - Number(')]'.includes(char));
    if (depth === 0 && char === separator) {
      parts.push('');
    } else {
      parts[parts.length - 1] += char;
    }
  }
  return parts;
}

const rules = [
  ...stylesheet()
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .matchAll(/([^{}]+)\{([^{}]*)\}/g),
].map(([, selectors, body], order) => ({
  order,
  selectors: split(selectors, ',').map((selector) => selector.trim()),
  declarations: new Map(
    body
      .split(';')
      .filter((declaration) => declaration.includes(':'))
      .map((declaration) => {
        const colon = declaration.indexOf(':');
        return [
          declaration.slice(0, colon).trim(),
          declaration
            .slice(colon + 1)
            .trim()
            .replace(/\s+/g, ' '),
        ];
      }),
  ),
}));

function compounds(selector: string): [string, string][] {
  const parts: [string, string][] = [];
  let combinator = '';
  let compound = '';
  let depth = 0;
  for (const char of selector.trim()) {
    if (depth === 0 && /[\s>+~]/.test(char)) {
      if (compound) {
        parts.push([combinator, compound]);
        compound = '';
        combinator = ' ';
      }
      combinator = char.trim() || combinator;
      continue;
    }
    depth += Number('(['.includes(char)) - Number(')]'.includes(char));
    compound += char;
  }
  parts.push([combinator, compound]);
  return parts;
}

function simpleSelectors(compound: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let previous = '';
  for (const char of compound) {
    if (
      parts.length === 0 ||
      (depth === 0 && '.#[:'.includes(char) && previous !== ':')
    ) {
      parts.push('');
    }
    depth += Number('(['.includes(char)) - Number(')]'.includes(char));
    parts[parts.length - 1] += char;
    previous = char;
  }
  return parts;
}

function memoized<T>(compute: (key: string) => T): (key: string) => T {
  const cache = new Map<string, T>();
  return (key) => {
    const known = cache.get(key);
    if (known !== undefined) {
      return known;
    }
    const value = compute(key);
    cache.set(key, value);
    return value;
  };
}

const parsedSelector = memoized((selector) =>
  compounds(selector).map(
    ([combinator, compound]) =>
      [combinator, simpleSelectors(compound)] as const,
  ),
);

const specificity = memoized((selector): number =>
  parsedSelector(selector)
    .flatMap(([, simples]) => simples)
    .reduce((sum, simple) => {
      const argument = /^:(?:not|has)\((.*)\)$/.exec(simple)?.[1];
      return (
        sum +
        (argument !== undefined
          ? Math.max(...split(argument, ',').map(specificity))
          : simple.startsWith('#')
            ? 10_000
            : /^(\.|\[|:(?!:))/.test(simple)
              ? 100
              : 1)
      );
    }, 0),
);

function descendants(element: MarkupElement): MarkupElement[] {
  return element.children.flatMap((child) => [child, ...descendants(child)]);
}

const parsedSimple = memoized((simple) => {
  const attribute = /^\[([\w-]+)(?:='([^']*)')?\]$/.exec(simple);
  if (attribute) {
    return { kind: '[', name: attribute[1], argument: attribute.at(2) };
  }
  const parsed = /^(::|[.#:]?)([\w-]+)(?:\((.*)\))?$/.exec(simple);
  assert.ok(parsed, simple);
  return { kind: parsed[1], name: parsed[2], argument: parsed.at(3) };
});

function matchesSimple(
  simple: string,
  element: MarkupElement,
  context: Context,
): boolean {
  if (simple === '*') {
    return true;
  }
  const parsed = parsedSimple(simple);
  if (parsed.kind === '[') {
    return parsed.argument === undefined
      ? element.attributes.has(parsed.name)
      : element.attributes.get(parsed.name) === parsed.argument;
  }
  const { kind, name, argument = '' } = parsed;
  const siblings = element.parent?.children ?? [element];
  switch (`${kind}${kind === ':' ? name : ''}`) {
    case '':
      return name === element.tag;
    case '.':
      return element.classes.includes(name);
    case '#':
      return element.attributes.get('id') === name;
    case '::':
      return false;
    case ':not':
      return !split(argument, ',').some((selector) =>
        matches(selector, element, context),
      );
    case ':has':
      return split(argument, ',').some((selector) =>
        descendants(element).some((descendant) =>
          matches(selector, descendant, context, element),
        ),
      );
    case ':nth-child':
      assert.ok(/^\d+$/.test(argument), simple);
      return siblings.indexOf(element) + 1 === Number(argument);
    case ':first-child':
      return siblings[0] === element;
    case ':last-child':
      return siblings.at(-1) === element;
    case ':disabled':
      return element.attributes.has('disabled');
    case ':hover':
      return context.hovered.has(element);
    case ':focus':
      return context.focused === element;
    case ':focus-within':
      return context.focusedWithin.has(element);
    case ':root':
      return false;
  }
  throw new Error(`Cannot match ${simple}`);
}

function matches(
  selector: string,
  element: MarkupElement,
  context: Context,
  scope?: MarkupElement,
): boolean {
  const parts = parsedSelector(selector);
  const matchesFrom = (index: number, candidate: MarkupElement): boolean => {
    const [combinator, simples] = parts[index];
    if (!simples.every((simple) => matchesSimple(simple, candidate, context))) {
      return false;
    }
    if (index === 0) {
      return (
        scope === undefined || combinator !== '>' || candidate.parent === scope
      );
    }
    const siblings = candidate.parent?.children ?? [];
    const before = siblings.slice(0, siblings.indexOf(candidate));
    const ancestors: MarkupElement[] = [];
    for (
      let parent = candidate.parent;
      parent && parent !== scope;
      parent = parent.parent
    ) {
      ancestors.push(parent);
    }
    const next =
      combinator === '>'
        ? ancestors.slice(0, 1)
        : combinator === '+'
          ? before.slice(-1)
          : combinator === '~'
            ? before
            : ancestors;
    return next.some((other) => matchesFrom(index - 1, other));
  };
  return matchesFrom(parts.length - 1, element);
}

const pseudoElementOf = memoized((selector) => {
  const [, own = '', pseudo = ''] =
    /^(.*?)((?:::[\w-]+)?)$/.exec(selector) ?? [];
  return { own: own || '*', pseudo: pseudo || undefined };
});

const selectorsByKey = Map.groupBy(
  rules.flatMap((rule) =>
    rule.selectors.map((selector) => {
      const [, last] =
        parsedSelector(pseudoElementOf(selector).own).at(-1) ?? [];
      const key =
        last?.find((simple) => simple.startsWith('.')) ??
        last?.find((simple) => /^[#\w-]/.test(simple)) ??
        '*';
      return { rule, selector, key };
    }),
  ),
  ({ key }) => key,
);

export function matchingRules(element: MarkupElement, states: States = {}) {
  const context = contextOf(element, states);
  const best = new Map<(typeof rules)[number], string>();
  for (const key of [
    '*',
    element.tag,
    `#${element.attributes.get('id')}`,
    ...element.classes.map((name) => `.${name}`),
  ]) {
    for (const { rule, selector } of selectorsByKey.get(key) ?? []) {
      const { own, pseudo } = pseudoElementOf(selector);
      const current = best.get(rule);
      if (
        pseudo === states.pseudoElement &&
        (current === undefined ||
          specificity(selector) > specificity(current)) &&
        matches(own, element, context)
      ) {
        best.set(rule, selector);
      }
    }
  }
  return [...best]
    .map(([rule, selector]) => ({
      ...rule,
      selector,
      specificity: specificity(selector),
    }))
    .toSorted((a, b) => a.specificity - b.specificity || a.order - b.order);
}

export function cascaded(
  element: MarkupElement,
  property: string,
  states: States = {},
): string | undefined {
  return matchingRules(element, states)
    .findLast((rule) => rule.declarations.has(property))
    ?.declarations.get(property);
}

export function rendered(
  node: React.ReactNode,
  within?: MarkupElement,
): MarkupElement {
  const top: MarkupElement[] = [];
  const open: MarkupElement[] = within ? [within] : [];
  for (const [, closing, tag, attributes, selfClosing] of renderToStaticMarkup(
    node,
  ).matchAll(/<(\/?)([\w-]+)([^>]*?)(\/?)>/g)) {
    if (closing) {
      open.pop();
      continue;
    }
    const parent = open.at(-1);
    const values = new Map(
      [...attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(
        ([, name, value = '']) => [name, value],
      ),
    );
    const element: MarkupElement = {
      tag,
      attributes: values,
      classes: (values.get('class') ?? '').split(/\s+/).filter(Boolean),
      parent,
      children: [],
    };
    if (parent === within) {
      top.push(element);
    }
    parent?.children.push(element);
    if (!selfClosing) {
      open.push(element);
    }
  }
  assert.strictEqual(top.length, 1);
  return top[0];
}

export function allWithClass(
  root: MarkupElement,
  ...names: string[]
): MarkupElement[] {
  return [root, ...descendants(root)].filter((element) =>
    names.every((name) => element.classes.includes(name)),
  );
}

export function withClass(
  root: MarkupElement,
  ...names: string[]
): MarkupElement {
  const [found] = allWithClass(root, ...names);
  assert.ok(found, names.join('.'));
  return found;
}
