import * as assert from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { suite, test } from 'vitest';
import { themeCss } from '../../../../shell/main/theme';
import {
  cursorLookOf,
  cursorVariables,
} from '../../../../lib/shared/cursorSettings';
import { defaultSettings } from '../../../helpers/fixtures';
import { fileColorClass } from '../../../../lib/shared/fileColors';
import { fileColorsOf } from '../../../../lib/page/fileColors';

const source = join(__dirname, '../../../..');
const pageFolders = [
  'shell/page',
  'lib/page',
  ...['tools', 'components'].flatMap((kind) =>
    readdirSync(join(source, kind)).map((part) => `${kind}/${part}/page`),
  ),
];

function pageFiles(): { name: string; text: string }[] {
  return pageFolders.flatMap((folder) =>
    readdirSync(join(source, folder)).map((name) => ({
      name: `${folder}/${name}`,
      text: readFileSync(join(source, folder, name), 'utf8'),
    })),
  );
}
const theme = themeCss(defaultSettings());
const dark = theme.slice(theme.indexOf('@media (prefers-color-scheme: dark)'));
const light = theme.slice(0, theme.indexOf('@media'));

function channelsOf(hex: string | undefined): readonly number[] {
  const digits = (hex ?? '').slice(1);
  const long = digits.length <= 4 ? digits.replaceAll(/./g, '$&$&') : digits;
  const [red = '', green = '', blue = '', alpha = 'ff'] =
    long.match(/../g) ?? [];
  return [red, green, blue, alpha].map((pair) => parseInt(pair, 16) / 255);
}

const mixed = (
  top: readonly number[],
  share: number,
  under: readonly number[],
): number[] =>
  [0, 1, 2].map((at) =>
    Math.round(255 * ((top[at] ?? 0) * share + (under[at] ?? 0) * (1 - share))),
  );

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
      /var\(\s*(--(?:(?:color|font|monospace-font)-[\w-]+|line-height|monospace-line-height|tab-size|scrollbar-setting|scrollbar-marked-setting))/g,
    )) {
      names.add(match[1]);
    }
  }
  return names;
}

const sized = (tabSize: number) => {
  const settings = defaultSettings();
  return /--tab-size: ([^;]+);/.exec(
    themeCss({ ...settings, text: { ...settings.text, tabSize } }),
  )?.[1];
};

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
      'shell/page/window.css': [
        'rgba(0, 0, 0, 0.22)',
        'rgba(0, 0, 0, 0.16)',
        'rgba(0, 0, 0, 0.2)',
      ],
      'components/cells/page/cellColors.ts': ['rgb(${red} ${green} ${blue})'],
      'components/syntax/page/engine.ts': ['#000000', '#ffffff'],
      'shell/page/appIcon.tsx': ['#FFFFFF'],
      'shell/page/appIconDrawing.ts': ['#1A73E8', '#D88B00', '#FBBC04'],
      'shell/page/windowButtons.ts': [
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

  test('writes the look of the cursor out as the variables the page reads it from, a steady cursor as off', () => {
    const css = themeCss({
      ...defaultSettings(),
      cursor: { style: 'underline', width: 4, blink: false },
    });
    assert.deepStrictEqual(
      cursorLookOf(
        (name) => new RegExp(`^  ${name}: (.*);$`, 'm').exec(css)?.[1] ?? '',
      ),
      { style: 'underline', width: 4, blink: false },
    );
    assert.match(css, new RegExp(`^  ${cursorVariables.blink}: off;$`, 'm'));
  });

  test("writes the settings out as the page's variables, the colors of each tool named after it, the dark colors for a dark OS", () => {
    const defaults = defaultSettings();
    const css = themeCss({
      ...defaults,
      tools: {
        ...defaults.tools,
        git: {
          ...defaults.tools.git,
          colors: { light: { icon: '#c00' }, dark: { icon: '#f00' } },
        },
        commander: {
          ...defaults.tools.commander,
          colors: { light: {}, dark: {} },
          fileColors: [],
        },
        terminal: {
          ...defaults.tools.terminal,
          colors: { light: { red: '#a00' }, dark: { red: '#e00' } },
        },
      },
      fonts: {
        family: 'Sans',
        size: '13px',
        lineHeight: 1.5,
        monospaceFamily: 'Mono',
        monospaceSize: '12px',
        monospaceLineHeight: 1.4,
      },
      scrolling: {
        ...defaults.scrolling,
        scrollbarSize: '25px',
        scrollbarSizeWithMarkers: '36px',
      },
      cursor: { style: 'bar', width: 3, blink: true },
      colors: { light: { foreground: '#000' }, dark: { foreground: '#fff' } },
    });
    assert.strictEqual(
      css,
      [
        ':root {',
        '  color-scheme: light;',
        '  --font-family: Sans;',
        '  --font-size: 13px;',
        '  --line-height: 1.5;',
        '  --monospace-font-family: Mono;',
        '  --monospace-font-size: 12px;',
        '  --monospace-line-height: 1.4;',
        '  --tab-size: 4;',
        '  --scrollbar-setting: 25px;',
        '  --scrollbar-marked-setting: 36px;',
        '  --cursor-style: bar;',
        '  --cursor-width: 3;',
        '  --cursor-blink: on;',
        '  --color-foreground: #000;',
        '  --color-terminal-red: #a00;',
        '  --color-git-icon: #c00;',
        '}',
        '',
        '@media (prefers-color-scheme: dark) {',
        '  :root {',
        '    color-scheme: dark;',
        '    --color-foreground: #fff;',
        '    --color-terminal-red: #e00;',
        '    --color-git-icon: #f00;',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
  });

  test('gives the files of each color group a class carrying its color, the light and the dark one, rather than have every row of a list carry its color in a style of its own, which kept the browser from sharing the style of one row with the next, 0.45 ms of each step of a folder of 20,000 files dragged by its scrollbar', () => {
    const defaults = defaultSettings();
    const groups = [
      { extensions: ['exe'], colors: { light: '#111', dark: '#eee' } },
      { extensions: 'languages', colors: { light: 'blue', dark: 'cyan' } },
    ] as const;
    const css = themeCss({
      ...defaults,
      tools: {
        ...defaults.tools,
        commander: { ...defaults.tools.commander, fileColors: groups },
      },
    });
    assert.deepStrictEqual(css.split('\n').slice(-3), [
      '.file-color-0 { --file-color: light-dark(#111, #eee); }',
      '.file-color-1 { --file-color: light-dark(blue, cyan); }',
      '',
    ]);
    assert.deepStrictEqual(
      [0, 1].map((group) => `.${fileColorClass(group)}`),
      ['.file-color-0', '.file-color-1'],
    );
    assert.deepStrictEqual(fileColorsOf(groups).colors, [
      'light-dark(#111, #eee)',
      'light-dark(blue, cyan)',
    ]);
    assert.strictEqual(
      themeCss(defaults).match(/^\.file-color-\d+ /gm)?.length,
      defaults.tools.commander.fileColors.length,
    );
  });

  test('selects text in the terminal in the color the rest of the app selects text in, by default, in the light and the dark theme', () => {
    const settings = defaultSettings();
    for (const scheme of ['light', 'dark'] as const) {
      const app = settings.colors[scheme];
      const terminal = settings.tools.terminal.colors[scheme];
      const selection = channelsOf(terminal.selection);
      assert.deepStrictEqual(
        mixed(selection, selection[3] ?? 1, channelsOf(terminal.background)),
        mixed(
          channelsOf(app.focus),
          parseFloat(app['focus-selected'] ?? '') / 100,
          channelsOf(app['panel-background']),
        ),
        scheme,
      );
    }
  });

  test('writes the tab size of the settings as the width every view draws a tab to, a whole number of columns from 1 to 16, 4 by default', () => {
    assert.deepStrictEqual(
      [
        /--tab-size: ([^;]+);/.exec(theme)?.[1],
        sized(2),
        sized(8.4),
        sized(0),
        sized(99),
        sized(Number.NaN),
      ],
      ['4', '2', '8', '1', '16', '4'],
    );
  });
});
