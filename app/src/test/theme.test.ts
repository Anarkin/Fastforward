import * as assert from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stylesheet } from './fixtures';

const webview = join(__dirname, '../../src/webview');
const theme = stylesheet('theme.css');
const dark = theme.slice(theme.indexOf('@media (prefers-color-scheme: dark)'));
const light = theme.slice(0, theme.indexOf('@media'));

function definitions(block: string): string[] {
  return [...block.matchAll(/^\s*(--[\w-]+):/gm)].map((match) => match[1]);
}

function colors(block: string): string[] {
  return definitions(block)
    .filter((name) => name.startsWith('--color-'))
    .toSorted();
}

function uses(): Set<string> {
  const names = new Set<string>();
  for (const file of readdirSync(webview)) {
    if (file === 'theme.css') {
      continue;
    }
    const source = readFileSync(join(webview, file), 'utf8');
    for (const match of source.matchAll(/var\(\s*(--(?:color|font)-[\w-]+)/g)) {
      names.add(match[1]);
    }
  }
  return names;
}

suite('Theme', () => {
  test('defines every color and font the view uses', () => {
    const defined = new Set(definitions(light));
    assert.deepStrictEqual(
      [...uses()].filter((name) => !defined.has(name)),
      [],
    );
  });

  test('gives every light color a dark one, and no dark color without a light one', () => {
    assert.deepStrictEqual(colors(dark), colors(light));
  });

  test('uses no color from outside the theme', () => {
    for (const file of readdirSync(webview)) {
      const source = readFileSync(join(webview, file), 'utf8');
      assert.doesNotMatch(source, /--vscode-/, file);
    }
  });
});
