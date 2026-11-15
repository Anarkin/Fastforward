import * as assert from 'node:assert';

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
