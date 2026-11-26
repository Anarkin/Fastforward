import { doubleShift, lightBits, wayBits, type Way } from './screen';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CellArea {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function strokeOf(ratio: number): number {
  return Math.max(1, Math.floor(ratio + 0.01));
}

const rect = (x: number, y: number, right: number, bottom: number): Rect => ({
  x,
  y,
  width: right - x,
  height: bottom - y,
});

export function lineRects(
  { x, y, width, height }: CellArea,
  bits: number,
  stroke: number,
): Rect[] {
  const light = bits & lightBits;
  const double = (bits >> doubleShift) & lightBits;
  const any = light | double;
  const has = (way: Way) => (any & wayBits[way]) !== 0;
  const isLight = (way: Way) => (light & wayBits[way]) !== 0;
  const isDouble = (way: Way) => (double & wayBits[way]) !== 0;
  const right = x + width;
  const bottom = y + height;
  const cx = x + Math.floor((width - stroke) / 2);
  const cy = y + Math.floor((height - stroke) / 2);
  const xa = cx - stroke;
  const xb = cx + stroke;
  const ya = cy - stroke;
  const yb = cy + stroke;
  const doubledAcross = isDouble('left') || isDouble('right');
  const doubledDown = isDouble('up') || isDouble('down');
  const rects: Rect[] = [];
  if (isLight('up')) {
    rects.push(
      rect(cx, y, cx + stroke, doubledAcross ? ya + stroke : cy + stroke),
    );
  }
  if (isLight('down')) {
    rects.push(rect(cx, doubledAcross ? yb : cy, cx + stroke, bottom));
  }
  if (isLight('left')) {
    rects.push(
      rect(x, cy, doubledDown ? xa + stroke : cx + stroke, cy + stroke),
    );
  }
  if (isLight('right')) {
    rects.push(rect(doubledDown ? xb : cx, cy, right, cy + stroke));
  }
  if (isDouble('up')) {
    const leftEnd = has('left')
      ? ya + stroke
      : has('down')
        ? bottom
        : yb + stroke;
    const rightEnd = has('right')
      ? ya + stroke
      : has('down')
        ? bottom
        : yb + stroke;
    rects.push(
      rect(xa, y, xa + stroke, leftEnd),
      rect(xb, y, xb + stroke, rightEnd),
    );
  }
  if (isDouble('down')) {
    const leftStart = has('left') ? yb : has('up') ? y : ya;
    const rightStart = has('right') ? yb : has('up') ? y : ya;
    rects.push(
      rect(xa, leftStart, xa + stroke, bottom),
      rect(xb, rightStart, xb + stroke, bottom),
    );
  }
  if (isDouble('left')) {
    const upperEnd = has('up')
      ? xa + stroke
      : has('right')
        ? right
        : xb + stroke;
    const lowerEnd = has('down')
      ? xa + stroke
      : has('right')
        ? right
        : xb + stroke;
    rects.push(
      rect(x, ya, upperEnd, ya + stroke),
      rect(x, yb, lowerEnd, yb + stroke),
    );
  }
  if (isDouble('right')) {
    const upperStart = has('up') ? xb : has('left') ? x : xa;
    const lowerStart = has('down') ? xb : has('left') ? x : xa;
    rects.push(
      rect(upperStart, ya, right, ya + stroke),
      rect(lowerStart, yb, right, yb + stroke),
    );
  }
  return rects.filter((each) => each.width > 0 && each.height > 0);
}

export function arrowRects(
  { x, y, width, height }: CellArea,
  way: Way,
  stroke: number,
): Rect[] {
  const cx = x + Math.floor((width - stroke) / 2);
  const cy = y + Math.floor((height - stroke) / 2);
  const half = Math.max(1, Math.floor((width - stroke) / 2));
  const rects: Rect[] = [];
  const tipDown = y + height + cy - y + stroke;
  const tipUp = y - (y + height - cy);
  const tipRight = x + width + cx - x + stroke;
  const tipLeft = x - (x + width - cx);
  switch (way) {
    case 'down': {
      const base = tipDown - half - 1;
      rects.push(rect(cx, y, cx + stroke, base));
      for (let step = 0; step <= half; step++) {
        const reach = half - step;
        rects.push(
          rect(cx - reach, base + step, cx + stroke + reach, base + step + 1),
        );
      }
      break;
    }
    case 'up': {
      const base = tipUp + half + 1;
      rects.push(rect(cx, base, cx + stroke, y + height));
      for (let step = 0; step <= half; step++) {
        const reach = half - step;
        rects.push(
          rect(cx - reach, base - step - 1, cx + stroke + reach, base - step),
        );
      }
      break;
    }
    case 'right': {
      const base = tipRight - half - 1;
      rects.push(rect(x, cy, base, cy + stroke));
      for (let step = 0; step <= half; step++) {
        const reach = half - step;
        rects.push(
          rect(base + step, cy - reach, base + step + 1, cy + stroke + reach),
        );
      }
      break;
    }
    case 'left': {
      const base = tipLeft + half + 1;
      rects.push(rect(base, cy, x + width, cy + stroke));
      for (let step = 0; step <= half; step++) {
        const reach = half - step;
        rects.push(
          rect(base - step - 1, cy - reach, base - step, cy + stroke + reach),
        );
      }
      break;
    }
    default:
      return way satisfies never;
  }
  return rects.filter((each) => each.width > 0 && each.height > 0);
}
