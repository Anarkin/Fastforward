import type { PixelSize } from './imageSize';

export function targetSide(
  longest: number,
  box: number,
  pixelRatio: number,
): number {
  return Math.max(1, Math.round(Math.min(box, longest) * pixelRatio));
}

export function bitmapResizing(
  stored: PixelSize | undefined,
  box: number,
  pixelRatio: number,
):
  | { readonly resizeWidth: number }
  | { readonly resizeHeight: number }
  | undefined {
  if (stored === undefined) {
    return undefined;
  }
  const target = targetSide(
    Math.max(stored.width, stored.height),
    box,
    pixelRatio,
  );
  return stored.width >= stored.height
    ? { resizeWidth: target }
    : { resizeHeight: target };
}

export function thumbnailPixels(drawn: PixelSize, target: number): PixelSize {
  const scale = target / Math.max(drawn.width, drawn.height, 1);
  return {
    width: Math.max(1, Math.round(drawn.width * scale)),
    height: Math.max(1, Math.round(drawn.height * scale)),
  };
}

const jpegFractions = [8, 4, 2];

export function jpegScaling(
  stored: PixelSize,
  target: number,
): PixelSize | undefined {
  const longest = Math.max(stored.width, stored.height);
  const divisor = jpegFractions.find(
    (each) => Math.ceil(longest / each) >= target,
  );
  return divisor === undefined
    ? undefined
    : {
        width: Math.ceil(stored.width / divisor),
        height: Math.ceil(stored.height / divisor),
      };
}

export function halvings(from: PixelSize, to: PixelSize): PixelSize[] {
  const steps: PixelSize[] = [];
  let current = from;
  while (current.width / 2 >= to.width && current.height / 2 >= to.height) {
    current = {
      width: Math.round(current.width / 2),
      height: Math.round(current.height / 2),
    };
    steps.push(current);
  }
  return steps;
}
