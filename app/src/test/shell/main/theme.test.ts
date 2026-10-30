import * as assert from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { suite, test } from 'vitest';
import { themeCss } from '../../../shell/main/theme';
import { defaultSettings } from '../../fixtures';

const source = join(__dirname, '../../../../src');
const pageFolders = [
  'shell/page',
  'ui',
  'tools/git/page',
  'tools/files/page',
  'tools/terminal/page',
];

function pageFiles(): { name: string; text: string }[] {
  return pageFolders.flatMap((folder) =>
    readdirSync(join(source, folder)).map((name) => ({
      name,
      text: readFileSync(join(source, folder, name), 'utf8'),
    })),
  );
}
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
  for (const { text } of pageFiles()) {
    for (const match of text.matchAll(
      /var\(\s*(--(?:(?:color|font|monospace-font)-[\w-]+|monospace-line-height|scrollbar-size|minimap-width))/g,
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

  test("uses no color from outside the theme but the logo's own, the shadows of popups, the dimming behind them and the colors that only tell syntax apart", () => {
    const allowed: Readonly<Record<string, readonly string[]>> = {
      'style.css': [
        'rgba(0, 0, 0, 0.22)',
        'rgba(0, 0, 0, 0.16)',
        'rgba(0, 0, 0, 0.2)',
      ],
      'syntaxEngine.ts': ['#000000', '#ffffff'],
      'titleBar.tsx': [
        '#4285F4',
        '#EA4335',
        '#FBBC04',
        '#34A853',
        'rgba(${data[0]}, ${data[1]}, ${data[2]}, ${data[3] / 255})',
      ],
    };
    for (const { name: file, text } of pageFiles()) {
      assert.deepStrictEqual(
        [
          ...new Set(
            text.match(
              /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([^)]*\)/gi,
            ),
          ),
        ],
        allowed[file] ?? [],
        file,
      );
    }
  });

  test("writes the settings out as the page's variables, the colors of each tool named after it, the dark colors for a dark OS", () => {
    const defaults = defaultSettings();
    const css = themeCss({
      ...defaults,
      tools: {
        git: {
          ...defaults.tools.git,
          colors: { light: { icon: '#c00' }, dark: { icon: '#f00' } },
        },
        files: { colors: { light: {}, dark: {} } },
        terminal: {
          ...defaults.tools.terminal,
          colors: { light: { red: '#a00' }, dark: { red: '#e00' } },
        },
      },
      fonts: {
        family: 'Sans',
        size: '13px',
        monospaceFamily: 'Mono',
        monospaceSize: '12px',
        monospaceLineHeight: 1.4,
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
        '  --monospace-line-height: 1.4;',
        '  --scrollbar-size: 25px;',
        '  --minimap-width: 40px;',
        '  --color-foreground: #000;',
        '  --color-git-icon: #c00;',
        '  --color-terminal-red: #a00;',
        '}',
        '',
        '@media (prefers-color-scheme: dark) {',
        '  :root {',
        '    color-scheme: dark;',
        '    --color-foreground: #fff;',
        '    --color-git-icon: #f00;',
        '    --color-terminal-red: #e00;',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
  });
});
