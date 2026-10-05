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

function specificity(selector: string): number {
  return compounds(selector)
    .flatMap(([, compound]) => simpleSelectors(compound))
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
    }, 0);
}

function descendants(element: MarkupElement): MarkupElement[] {
  return element.children.flatMap((child) => [child, ...descendants(child)]);
}

function matchesSimple(simple: string, element: MarkupElement): boolean {
  const attribute = /^\[([\w-]+)(?:='([^']*)')?\]$/.exec(simple);
  if (attribute) {
    const [, name, value] = attribute;
    return value === undefined
      ? element.attributes.has(name)
      : element.attributes.get(name) === value;
  }
  const parsed = /^(::|[.#:]?)([\w-]+)(?:\((.*)\))?$/.exec(simple);
  assert.ok(parsed, simple);
  const [, kind, name, argument = ''] = parsed;
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
        matches(selector, element),
      );
    case ':has':
      return split(argument, ',').some((selector) =>
        descendants(element).some((descendant) =>
          matches(selector, descendant, element),
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
    case ':focus':
    case ':focus-within':
    case ':root':
      return false;
  }
  throw new Error(`Cannot match ${simple}`);
}

function matches(
  selector: string,
  element: MarkupElement,
  scope?: MarkupElement,
): boolean {
  const parts = compounds(selector);
  const matchesFrom = (index: number, candidate: MarkupElement): boolean => {
    const [combinator, compound] = parts[index];
    if (
      !simpleSelectors(compound).every((simple) =>
        matchesSimple(simple, candidate),
      )
    ) {
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

export function matchingRules(element: MarkupElement) {
  return rules
    .flatMap((rule) => {
      const [selector] = rule.selectors
        .filter((candidate) => matches(candidate, element))
        .toSorted((a, b) => specificity(b) - specificity(a));
      return selector === undefined
        ? []
        : [{ ...rule, selector, specificity: specificity(selector) }];
    })
    .toSorted((a, b) => a.specificity - b.specificity || a.order - b.order);
}

export function cascaded(
  element: MarkupElement,
  property: string,
): string | undefined {
  return matchingRules(element)
    .findLast((rule) => rule.declarations.has(property))
    ?.declarations.get(property);
}

export function rendered(node: React.ReactNode): MarkupElement {
  const top: MarkupElement[] = [];
  const open: MarkupElement[] = [];
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
    (parent?.children ?? top).push(element);
    if (!selfClosing) {
      open.push(element);
    }
  }
  assert.strictEqual(top.length, 1);
  return top[0];
}

export function withClass(root: MarkupElement, name: string): MarkupElement {
  const found = [root, ...descendants(root)].find((element) =>
    element.classes.includes(name),
  );
  assert.ok(found, name);
  return found;
}
