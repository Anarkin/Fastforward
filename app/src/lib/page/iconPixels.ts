export interface PixelBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function boxOutline({ x, y, width, height }: PixelBox): string {
  return `M${x} ${y}h${width}v${height}h${-width}Z`;
}
