import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { withStores } from './componentFixtures';

export interface MarkupElement {
  readonly tag: string;
  readonly attributes: ReadonlyMap<string, string>;
  readonly classes: readonly string[];
  readonly parent: MarkupElement | undefined;
  readonly children: MarkupElement[];
}

export function descendants(element: MarkupElement): MarkupElement[] {
  return element.children.flatMap((child) => [child, ...descendants(child)]);
}

export function renderedApart(
  node: React.ReactNode,
  within?: MarkupElement,
): MarkupElement[] {
  const top: MarkupElement[] = [];
  const open: MarkupElement[] = within ? [within] : [];
  for (const [, closing, tag, attributes, selfClosing] of renderToStaticMarkup(
    withStores(node),
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
  return top;
}

export function rendered(
  node: React.ReactNode,
  within?: MarkupElement,
): MarkupElement {
  const top = renderedApart(node, within);
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

export function tagsWith(html: string, ...classes: string[]): string[] {
  return [...html.matchAll(/<[a-z][^>]*>/g)]
    .map(([tag]) => tag)
    .filter((tag) => {
      const own = classesOf(tag);
      return classes.every((name) => own.has(name));
    });
}

export function classesOf(tag: string): Set<string> {
  const [, names = ''] = /\sclass="([^"]*)"/.exec(tag) ?? [];
  return new Set(names.split(/\s+/).filter(Boolean));
}

export function tagWith(
  html: string,
  text: string,
  ...classes: string[]
): string {
  const found = tagsWith(html, ...classes).filter((tag) => tag.includes(text));
  assert.strictEqual(found.length, 1, `${classes.join(' ')} with ${text}`);
  return found[0];
}
