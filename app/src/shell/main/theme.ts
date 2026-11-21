import type { Settings } from './settings';
import type { ToolId } from '../shared/tools';
import { cursorVariables } from '../../lib/shared/cursorSettings';
import {
  fileColorClass,
  fileColorValue,
  type FileColor,
} from '../../lib/shared/fileColors';

const themedTools = [
  'terminal',
  'commander',
  'git',
] as const satisfies readonly ToolId[];

function declarations(
  values: Readonly<Record<string, string>>,
  prefix: string,
  indent: string,
): string[] {
  return Object.entries(values).map(
    ([name, value]) => `${indent}--${prefix}${name}: ${value};`,
  );
}

function fileColorRules(groups: readonly FileColor[]): string[] {
  return groups.length === 0
    ? []
    : [
        ...groups.map(
          (group, index) =>
            `.${fileColorClass(index)} { --file-color: ${fileColorValue(group)}; }`,
        ),
        '',
      ];
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
    ...themedTools.flatMap((tool) =>
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
    `  --scrollbar-setting: ${sizes.scrollbar};`,
    `  ${cursorVariables.style}: ${cursor.style};`,
    `  ${cursorVariables.width}: ${cursor.width};`,
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
    ...fileColorRules(tools.commander.fileColors),
  ].join('\n');
}
