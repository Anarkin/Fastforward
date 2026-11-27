import {
  filled,
  parsedColor,
  type Rgba,
} from '../../../components/cells/page/cellColors';
import type { ITheme } from '@xterm/xterm';

const themeColors = {
  background: 'var(--color-terminal-background)',
  foreground: 'var(--color-terminal-foreground)',
  cursor: 'var(--color-cursor)',
  cursorAccent: 'var(--color-cursor-text)',
  selectionBackground: 'var(--color-terminal-selection)',
  black: 'var(--color-terminal-black)',
  red: 'var(--color-terminal-red)',
  green: 'var(--color-terminal-green)',
  yellow: 'var(--color-terminal-yellow)',
  blue: 'var(--color-terminal-blue)',
  magenta: 'var(--color-terminal-magenta)',
  cyan: 'var(--color-terminal-cyan)',
  white: 'var(--color-terminal-white)',
  brightBlack: 'var(--color-terminal-bright-black)',
  brightRed: 'var(--color-terminal-bright-red)',
  brightGreen: 'var(--color-terminal-bright-green)',
  brightYellow: 'var(--color-terminal-bright-yellow)',
  brightBlue: 'var(--color-terminal-bright-blue)',
  brightMagenta: 'var(--color-terminal-bright-magenta)',
  brightCyan: 'var(--color-terminal-bright-cyan)',
  brightWhite: 'var(--color-terminal-bright-white)',
} as const satisfies Partial<Record<keyof ITheme, string>>;

export function terminalTheme(resolve: (color: string) => string): ITheme {
  return Object.fromEntries(
    Object.entries(themeColors).map(([name, color]) => [name, resolve(color)]),
  );
}

export function withHiddenCursor(theme: ITheme): ITheme {
  return { ...theme, cursor: theme.background };
}

const colorFunction = /^(?:rgba?|color)\(/;

export function opaqueHexOf(color: string, under: Rgba): string | undefined {
  if (!colorFunction.test(color)) {
    return undefined;
  }
  return `#${filled(under, parsedColor(color))
    .slice(0, 3)
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}
