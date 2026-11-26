export interface Unit {
  readonly width: number;
  readonly height: number;
}

export interface Box {
  readonly column: number;
  readonly row: number;
  readonly columns: number;
  readonly rows: number;
}

interface Placed {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function unitOf(char: number, line: number): Unit {
  return {
    width: Math.max(1, Math.round(char)),
    height: Math.max(1, Math.round(line)),
  };
}

export function boxOf({ x, y, width, height }: Placed, unit: Unit): Box {
  const column = Math.round(x / unit.width);
  const row = Math.round(y / unit.height);
  return {
    column,
    row,
    columns: Math.max(1, Math.round((x + width) / unit.width) - column),
    rows: Math.max(1, Math.round((y + height) / unit.height) - row),
  };
}
