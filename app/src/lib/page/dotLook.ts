export interface DotLook {
  readonly advance: number;
  readonly dot: number;
  readonly start: number;
  readonly pixel: number;
}

const onPixel = 1e-6;

const roundedTo = (value: number, step: number) =>
  Math.round(value / step + onPixel) * step;

const floorTo = (value: number, step: number) =>
  Math.floor(value / step + onPixel) * step;

export function dotLook(
  fontSize: number,
  advance: number,
  pixel: number,
): DotLook {
  const dot = Math.max(pixel, roundedTo(0.16 * fontSize, pixel));
  return {
    advance,
    dot,
    start: floorTo((roundedTo(advance, pixel) - dot) / 2, pixel),
    pixel,
  };
}

const sized = /(\d+(?:\.\d+)?)px/;

export function fontDotLook(
  font: string,
  advance: number,
  pixel: number,
): DotLook | undefined {
  const size = sized.exec(font)?.[1];
  return size === undefined || !(advance > 0) || !(pixel > 0)
    ? undefined
    : dotLook(Number(size), advance, pixel);
}
