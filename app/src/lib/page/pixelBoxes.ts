export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface Edges {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

const layoutUnits = 64;

const snapped = (device: number) =>
  Math.round(Math.round(device * layoutUnits) / layoutUnits);

export function pixelBox(box: Box, ratio: number): Box {
  const left = snapped(box.left * ratio);
  const top = snapped(box.top * ratio);
  return {
    left,
    top,
    width: snapped((box.left + box.width) * ratio) - left,
    height: snapped((box.top + box.height) * ratio) - top,
  };
}

export function placedBox(
  box: Box,
  ratio: number,
  origin: { readonly left: number; readonly top: number },
): Box {
  return {
    left: box.left / ratio - origin.left,
    top: box.top / ratio - origin.top,
    width: box.width / ratio,
    height: box.height / ratio,
  };
}
