import type { ITheme } from '@xterm/xterm';

const themeColors = {
  background: 'var(--color-terminal-background)',
  foreground: 'var(--color-terminal-foreground)',
  cursor: 'var(--color-terminal-foreground)',
  cursorAccent: 'var(--color-terminal-background)',
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

export interface TerminalFont {
  readonly fontFamily: string;
  readonly fontSize: number;
}

export const fontVariables = {
  family: 'var(--monospace-font-family)',
  size: 'var(--monospace-font-size)',
  rowHeight: 'var(--terminal-row-height)',
  advance: 'var(--terminal-advance)',
} as const;

export function lineHeightFor(
  rowHeight: number,
  glyphHeight: number,
  ratio: number,
): number {
  const glyph = Math.ceil(glyphHeight * ratio);
  const row = Math.round(rowHeight * ratio);
  return Math.max(1, (row + 0.5) / glyph);
}

export function letterSpacingFor(
  advance: number,
  glyphWidth: number,
  ratio: number,
): number {
  return Math.round(advance * ratio) - Math.floor(glyphWidth * ratio);
}

export function terminalFont(family: string, size: string): TerminalFont {
  const pixels = Number.parseFloat(size);
  return {
    fontFamily: family,
    fontSize: Number.isFinite(pixels) && pixels > 0 ? pixels : 12,
  };
}
