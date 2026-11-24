export interface Box {
  readonly width: number;
  readonly height: number;
}

export interface Grid {
  readonly columns: number;
  readonly rows: number;
}

const slack = 1e-6;

const wholeCells = (room: number, cell: number, had: number) =>
  cell > 0 ? Math.max(1, Math.floor(room / cell + slack)) : had;

export function gridWithin(screen: Box, drawn: Box, grid: Grid): Grid {
  return {
    columns: wholeCells(
      screen.width,
      grid.columns > 0 ? drawn.width / grid.columns : 0,
      grid.columns,
    ),
    rows: wholeCells(
      screen.height,
      grid.rows > 0 ? drawn.height / grid.rows : 0,
      grid.rows,
    ),
  };
}
