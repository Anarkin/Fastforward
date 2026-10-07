import * as assert from 'node:assert';
import { readDefaults, type Settings } from '../settings';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CommitInfo, FileChange } from '../shared/protocol';

export const commitInfo = (
  hash: string,
  extra: Partial<CommitInfo> = {},
): CommitInfo => ({
  hash,
  subject: hash,
  authorName: 'Test',
  commitDate: 0,
  ...extra,
});

export const fileChange = (
  path: string,
  extra: Partial<FileChange> = {},
): FileChange => ({
  path,
  oldPath: undefined,
  status: 'M',
  insertions: 1,
  deletions: 2,
  ...extra,
});

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

export function element(
  tagName: string,
  isContentEditable = false,
): EventTarget {
  const target = {
    tagName,
    isContentEditable,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
  return target;
}

export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  what: string,
  timeout = 15_000,
): Promise<void> {
  const until = Date.now() + timeout;
  while (!(await condition())) {
    if (Date.now() > until) {
      throw new Error(`Timed out waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

export function stylesheet(name = 'style.css'): string {
  return readFileSync(join(__dirname, '../../src/webview', name), 'utf8');
}

export function stylesheetPx(pattern: RegExp): number {
  const match = pattern.exec(stylesheet());
  assert.ok(match, String(pattern));
  return Number(match[1]);
}

export function countingReads<T extends object>(
  target: T,
): { readonly counted: T; reads: number } {
  const counter = {
    reads: 0,
    counted: new Proxy(target, {
      get(object, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) {
          counter.reads++;
        }
        return Reflect.get(object, key, receiver) as unknown;
      },
    }),
  };
  return counter;
}

export function renderedBy<P>(
  component: (props: P) => React.ReactNode,
  props: P,
): React.ReactNode {
  let rendered: React.ReactNode;
  function Probe() {
    rendered = component(props);
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  return rendered;
}

export function defaultSettings(): Settings {
  return readDefaults(join(__dirname, '../../src/settings.json'));
}

export const noop = () => {};

export function tagWith(
  html: string,
  text: string,
  ...classes: string[]
): string {
  const found = tagsWith(html, ...classes).filter((tag) => tag.includes(text));
  assert.strictEqual(found.length, 1, `${classes.join(' ')} with ${text}`);
  return found[0];
}
