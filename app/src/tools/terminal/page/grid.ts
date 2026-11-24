export interface Box {
  readonly width: number;
  readonly height: number;
}

export interface Grid {
  readonly columns: number;
  readonly rows: number;
}

const slack = 0.05;

const wholeCells = (room: number, cell: number, had: number) =>
  cell > 0 ? Math.max(1, Math.floor(room / cell + slack)) : had;

const onPixels = (length: number, ratio: number | undefined) =>
  ratio === undefined ? length : Math.round(length * ratio) / ratio;

export function gridWithin(
  screen: Box,
  drawn: Box,
  grid: Grid,
  ratio?: number,
): Grid {
  return {
    columns: wholeCells(
      screen.width,
      grid.columns > 0 ? onPixels(drawn.width / grid.columns, ratio) : 0,
      grid.columns,
    ),
    rows: wholeCells(
      screen.height,
      grid.rows > 0 ? onPixels(drawn.height / grid.rows, ratio) : 0,
      grid.rows,
    ),
  };
}

export function layoutGrid(
  screen: Box,
  drawn: Box,
  grid: Grid,
  proposed: Grid | undefined,
  ratio?: number,
  cell?: Box,
): Grid {
  if (
    cell !== undefined &&
    ratio !== undefined &&
    cell.width > 0 &&
    cell.height > 0
  ) {
    return {
      columns: wholeCells(
        Math.round(screen.width * ratio),
        Math.round(cell.width * ratio),
        grid.columns,
      ),
      rows: wholeCells(
        Math.round(screen.height * ratio),
        Math.round(cell.height * ratio),
        grid.rows,
      ),
    };
  }
  return drawn.width > 0 && drawn.height > 0
    ? gridWithin(screen, drawn, grid, ratio)
    : (proposed ?? grid);
}
