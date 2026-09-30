import type { Settings } from './settings';

function declarations(
  values: Readonly<Record<string, string>>,
  prefix: string,
  indent: string,
): string[] {
  return Object.entries(values).map(
    ([name, value]) => `${indent}--${prefix}${name}: ${value};`,
  );
}

export function themeCss({ fonts, sizes, colors }: Settings): string {
  return [
    ':root {',
    '  color-scheme: light;',
    `  --font-family: ${fonts.family};`,
    `  --font-size: ${fonts.size};`,
    `  --monospace-font-family: ${fonts.monospaceFamily};`,
    `  --monospace-font-size: ${fonts.monospaceSize};`,
    `  --scrollbar-size: ${sizes.scrollbar};`,
    `  --minimap-width: ${sizes.minimap};`,
    ...declarations(colors.light, 'color-', '  '),
    '}',
    '',
    '@media (prefers-color-scheme: dark) {',
    '  :root {',
    '    color-scheme: dark;',
    ...declarations(colors.dark, 'color-', '    '),
    '  }',
    '}',
    '',
  ].join('\n');
}
