import type { Settings } from './settings';
import { tools as toolIds } from '../shared/tools';
import { cursorVariables } from '../../lib/shared/cursorSettings';

function declarations(
  values: Readonly<Record<string, string>>,
  prefix: string,
  indent: string,
): string[] {
  return Object.entries(values).map(
    ([name, value]) => `${indent}--${prefix}${name}: ${value};`,
  );
}

export function themeCss({
  fonts,
  sizes,
  cursor,
  colors,
  tools,
}: Settings): string {
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
    `  --line-height: ${fonts.lineHeight};`,
    `  --monospace-font-family: ${fonts.monospaceFamily};`,
    `  --monospace-font-size: ${fonts.monospaceSize};`,
    `  --monospace-line-height: ${fonts.monospaceLineHeight};`,
    `  --scrollbar-size: ${sizes.scrollbar};`,
    `  --minimap-width: ${sizes.minimap};`,
    `  ${cursorVariables.style}: ${cursor.style};`,
    `  ${cursorVariables.barWidth}: ${cursor.barWidth};`,
    `  ${cursorVariables.blink}: ${cursor.blink ? 'on' : 'off'};`,
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
