export interface PixelBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface IconGrid {
  readonly margin: number;
  readonly span: number;
  readonly unit: (units: number) => number;
  readonly thin: number;
}

const designedSpan = 14;

export function iconGrid(size: number): IconGrid {
  const margin = Math.max(1, Math.round(size / 16));
  const span = size - 2 * margin;
  return {
    margin,
    span,
    unit: (units) => Math.round((span * units) / designedSpan),
    thin: Math.max(1, Math.floor(span / 12)),
  };
}

export function boxOutline({ x, y, width, height }: PixelBox): string {
  return `M${x} ${y}h${width}v${height}h${-width}Z`;
}
