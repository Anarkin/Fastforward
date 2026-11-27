import {
  outsideBottom,
  outsideLeft,
  outsideRight,
  outsideTop,
  type Screen,
} from './screen';

export interface DotRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DotLook {
  readonly advance: number;
  readonly rowHeight: number;
  readonly stroke: number;
  readonly shift: { readonly x: number; readonly y: number };
}

function cornerShown(
  screen: Screen,
  column: number,
  row: number,
  sides: number,
): boolean {
  if (column < 0 || row < 0 || column >= screen.columns || row >= screen.rows) {
    return false;
  }
  const at = row * screen.columns + column;
  return screen.covered[at] === 0 || ((screen.outside[at] ?? 0) & sides) !== 0;
}

export function cornerRects(
  screen: Screen,
  { advance, rowHeight, stroke, shift }: DotLook,
): DotRect[] {
  const rects: DotRect[] = [];
  const pixel = (x: number, y: number) => {
    rects.push({ x, y, width: stroke, height: stroke });
  };
  for (let row = 0; row <= screen.rows; row++) {
    for (let column = 0; column <= screen.columns; column++) {
      const above = cornerShown(
        screen,
        column - 1,
        row - 1,
        outsideBottom | outsideRight,
      );
      const aboveRight = cornerShown(
        screen,
        column,
        row - 1,
        outsideBottom | outsideLeft,
      );
      const below = cornerShown(
        screen,
        column - 1,
        row,
        outsideTop | outsideRight,
      );
      const belowRight = cornerShown(
        screen,
        column,
        row,
        outsideTop | outsideLeft,
      );
      const x = column * advance - shift.x;
      const y = row * rowHeight - shift.y;
      if (above && aboveRight && below && belowRight) {
        rects.push({
          x: x - stroke,
          y: y - stroke,
          width: 2 * stroke,
          height: 2 * stroke,
        });
        continue;
      }
      if (above) {
        pixel(x - stroke, y - stroke);
      }
      if (aboveRight) {
        pixel(x, y - stroke);
      }
      if (below) {
        pixel(x - stroke, y);
      }
      if (belowRight) {
        pixel(x, y);
      }
    }
  }
  return rects;
}
