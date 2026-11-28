export type Rgba = readonly [number, number, number, number];

const numbers = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

const space = /^color\(\s*[a-z][\w-]*/i;

export function parsedColor(css: string): Rgba {
  const [red = 0, green = 0, blue = 0, alpha = 1] = Array.from(
    css.replace(space, '').matchAll(numbers),
    ([number]) => Number(number),
  );
  const unit = css.startsWith('color(') ? 255 : 1;
  return [red * unit, green * unit, blue * unit, alpha];
}

export function over(base: Rgba, layer: Rgba): Rgba {
  const alpha = layer[3];
  return [
    Math.round(base[0] + (layer[0] - base[0]) * alpha),
    Math.round(base[1] + (layer[1] - base[1]) * alpha),
    Math.round(base[2] + (layer[2] - base[2]) * alpha),
    1,
  ];
}

const byte = 255;

export function filled(base: Rgba, layer: Rgba): Rgba {
  const share = layer[3];
  const kept = (byte - Math.round(share * byte)) / byte;
  const blended = (under: number, above: number) =>
    Math.round(Math.round(above * share) + under * kept);
  return [
    blended(base[0], layer[0]),
    blended(base[1], layer[1]),
    blended(base[2], layer[2]),
    1,
  ];
}

export const cssOf = ([red, green, blue]: Rgba): string =>
  `rgb(${red} ${green} ${blue})`;

const byteOf = (part: number): number =>
  Math.min(byte, Math.max(0, Math.trunc(part)));

export const packedOf = ([red, green, blue]: Rgba): number =>
  ((255 << 24) | (byteOf(blue) << 16) | (byteOf(green) << 8) | byteOf(red)) >>>
  0;
