import type { Screen } from './screen';

export interface GridPoint {
  readonly column: number;
  readonly row: number;
}

function open(screen: Screen, column: number, row: number): boolean {
  return (
    column >= 0 &&
    row >= 0 &&
    column < screen.columns &&
    row < screen.rows &&
    screen.covered[row * screen.columns + column] === 0
  );
}

export function gridDots(screen: Screen): GridPoint[] {
  const dots: GridPoint[] = [];
  for (let row = 0; row <= screen.rows; row++) {
    for (let column = 0; column <= screen.columns; column++) {
      if (
        open(screen, column - 1, row - 1) ||
        open(screen, column, row - 1) ||
        open(screen, column - 1, row) ||
        open(screen, column, row)
      ) {
        dots.push({ column, row });
      }
    }
  }
  return dots;
}
