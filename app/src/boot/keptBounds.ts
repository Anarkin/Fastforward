import type { Bounds } from './windowPlacement';

interface NormalBounds {
  getNormalBounds(): Bounds;
}

const scaledGrowth = 16;

export function keptBounds(
  window: NormalBounds,
  made: Bounds,
): {
  readonly moved: () => void;
  readonly resized: () => void;
  readonly bounds: () => Bounds;
} {
  let bounds = made;
  return {
    moved: () => {
      const moved = window.getNormalBounds();
      bounds =
        Math.abs(moved.width - bounds.width) <= scaledGrowth &&
        Math.abs(moved.height - bounds.height) <= scaledGrowth
          ? { ...bounds, x: moved.x, y: moved.y }
          : moved;
    },
    resized: () => {
      bounds = window.getNormalBounds();
    },
    bounds: () => bounds,
  };
}
