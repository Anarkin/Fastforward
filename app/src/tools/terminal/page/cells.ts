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
