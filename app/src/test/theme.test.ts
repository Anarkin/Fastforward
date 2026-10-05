import * as assert from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { themeCss } from '../theme';
import { defaultSettings } from './fixtures';

const webview = join(__dirname, '../../src/webview');
const theme = themeCss(defaultSettings());
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
    const source = readFileSync(join(webview, file), 'utf8');
    for (const match of source.matchAll(
      /var\(\s*(--(?:(?:color|font|monospace-font)-[\w-]+|scrollbar-size|minimap-width))/g,
    )) {
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

  test('defines no color the view no longer uses', () => {
    const used = uses();
    assert.deepStrictEqual(
      colors(light).filter((name) => !used.has(name)),
      [],
    );
  });

  test('gives every light color a dark one, and no dark color without a light one', () => {
    assert.deepStrictEqual(colors(dark), colors(light));
  });

  test("uses no color from outside the theme but the logo's own, the shadows of popups and the colors that only tell syntax apart", () => {
    const allowed: Readonly<Record<string, readonly string[]>> = {
      'style.css': ['rgba(0, 0, 0, 0.22)', 'rgba(0, 0, 0, 0.16)'],
      'syntax.ts': ['#000000', '#ffffff'],
      'titleBar.tsx': ['#4285F4', '#EA4335', '#FBBC04', '#34A853'],
    };
    for (const file of readdirSync(webview)) {
      const source = readFileSync(join(webview, file), 'utf8');
      assert.deepStrictEqual(
        [
          ...new Set(
            source.match(
              /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([^)]*\)/gi,
            ),
          ),
        ],
        allowed[file] ?? [],
        file,
      );
    }
  });

  test("writes the settings out as the page's variables, the dark colors for a dark OS", () => {
    const css = themeCss({
      ...defaultSettings(),
      fonts: {
        family: 'Sans',
        size: '13px',
        monospaceFamily: 'Mono',
        monospaceSize: '12px',
      },
      sizes: { scrollbar: '25px', minimap: '40px' },
      colors: { light: { foreground: '#000' }, dark: { foreground: '#fff' } },
    });
    assert.strictEqual(
      css,
      [
        ':root {',
        '  color-scheme: light;',
        '  --font-family: Sans;',
        '  --font-size: 13px;',
        '  --monospace-font-family: Mono;',
        '  --monospace-font-size: 12px;',
        '  --scrollbar-size: 25px;',
        '  --minimap-width: 40px;',
        '  --color-foreground: #000;',
        '}',
        '',
        '@media (prefers-color-scheme: dark) {',
        '  :root {',
        '    color-scheme: dark;',
        '    --color-foreground: #fff;',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
  });
});
