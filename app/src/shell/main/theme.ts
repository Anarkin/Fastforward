import type { Settings } from './settings';
import { tools as toolIds } from '../shared/tools';

function declarations(
  values: Readonly<Record<string, string>>,
  prefix: string,
  indent: string,
): string[] {
  return Object.entries(values).map(
    ([name, value]) => `${indent}--${prefix}${name}: ${value};`,
  );
}

export function themeCss({ fonts, sizes, colors, tools }: Settings): string {
  const themed = (theme: 'light' | 'dark', indent: string) => [
    ...declarations(colors[theme], 'color-', indent),
    ...toolIds.flatMap((tool) =>
      declarations(tools[tool].colors[theme], `color-${tool}-`, indent),
    ),
  ];
  return [
    ':root {',
    '  color-scheme: light;',
    `  --font-family: ${fonts.family};`,
    `  --font-size: ${fonts.size};`,
    `  --monospace-font-family: ${fonts.monospaceFamily};`,
    `  --monospace-font-size: ${fonts.monospaceSize};`,
    `  --monospace-line-height: ${fonts.monospaceLineHeight};`,
    `  --scrollbar-size: ${sizes.scrollbar};`,
    `  --minimap-width: ${sizes.minimap};`,
    ...themed('light', '  '),
    '}',
    '',
    '@media (prefers-color-scheme: dark) {',
    '  :root {',
    '    color-scheme: dark;',
    ...themed('dark', '    '),
    '  }',
    '}',
    '',
  ].join('\n');
}
