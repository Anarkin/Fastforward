export interface CellWindow {
  readonly row: number;
  readonly rows: number;
  readonly column: number;
  readonly columns: number;
}

interface Block {
  readonly left: number;
  readonly top: number;
  readonly rows: number;
  readonly columns: number;
}

interface Cell {
  readonly advance: number;
  readonly rowHeight: number;
}

interface Shown {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

function inSight(
  from: number,
  size: number,
  count: number,
  start: number,
  end: number,
): { readonly first: number; readonly last: number } | undefined {
  const first = Math.max(0, Math.floor((start - from) / size));
  const last = Math.min(count, Math.ceil((end - from) / size));
  return last > first ? { first, last } : undefined;
}

export function cellWindow(
  block: Block,
  { advance, rowHeight }: Cell,
  shown: Shown,
  margin: { readonly rows: number; readonly columns: number },
): CellWindow | undefined {
  const down = inSight(
    block.top,
    rowHeight,
    block.rows,
    shown.top,
    shown.bottom,
  );
  const across = inSight(
    block.left,
    advance,
    block.columns,
    shown.left,
    shown.right,
  );
  if (down === undefined || across === undefined) {
    return undefined;
  }
  const row = Math.max(0, down.first - margin.rows);
  const column = Math.max(0, across.first - margin.columns);
  return {
    row,
    rows: Math.min(block.rows, down.last + margin.rows) - row,
    column,
    columns: Math.min(block.columns, across.last + margin.columns) - column,
  };
}

export function holds(
  drawn: CellWindow | undefined,
  block: Block,
  { advance, rowHeight }: Cell,
  shown: Shown,
): boolean {
  if (drawn === undefined) {
    return false;
  }
  const down = inSight(
    block.top,
    rowHeight,
    block.rows,
    shown.top,
    shown.bottom,
  );
  const across = inSight(
    block.left,
    advance,
    block.columns,
    shown.left,
    shown.right,
  );
  return (
    down !== undefined &&
    across !== undefined &&
    down.first >= drawn.row &&
    down.last <= drawn.row + drawn.rows &&
    across.first >= drawn.column &&
    across.last <= drawn.column + drawn.columns
  );
}
