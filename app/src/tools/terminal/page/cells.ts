export interface TerminalFont {
  readonly fontFamily: string;
  readonly fontSize: number;
}

const fontVariables = {
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

function fontOf(probe: HTMLElement): TerminalFont {
  probe.style.fontFamily = fontVariables.family;
  probe.style.fontSize = fontVariables.size;
  const style = getComputedStyle(probe);
  return terminalFont(style.fontFamily, style.fontSize);
}

export function cellsOf(
  probe: HTMLElement,
  webgl: boolean,
): TerminalFont & {
  readonly lineHeight: number;
  readonly letterSpacing: number;
} {
  const font = fontOf(probe);
  probe.style.lineHeight = fontVariables.rowHeight;
  probe.style.width = fontVariables.advance;
  const probed = getComputedStyle(probe);
  const rowHeight = Number.parseFloat(probed.lineHeight);
  const advance = Number.parseFloat(probed.width);
  const context = new OffscreenCanvas(1, 1).getContext('2d');
  if (context === null || !Number.isFinite(rowHeight)) {
    return {
      ...font,
      lineHeight: 1,
      letterSpacing: 0,
    };
  }
  context.font = `${font.fontSize}px ${font.fontFamily}`;
  const glyph = context.measureText('W');
  return {
    ...font,
    lineHeight: lineHeightFor(
      rowHeight,
      glyph.fontBoundingBoxAscent + glyph.fontBoundingBoxDescent,
      devicePixelRatio,
    ),
    letterSpacing:
      webgl && Number.isFinite(advance)
        ? letterSpacingFor(advance, glyph.width, devicePixelRatio)
        : 0,
  };
}
