export type DotRows = readonly (readonly number[])[];

function columnsDrawn(rows: DotRows): number {
  let most = 0;
  for (const columns of rows) {
    most = Math.max(most, (columns.at(-1) ?? 0) + 1);
  }
  let drawn = 100;
  while (drawn < most) {
    drawn *= 10;
  }
  return drawn;
}

function cells(columns: readonly number[], drawn: number): string[] {
  const stops: string[] = [];
  let from = columns[0];
  columns.forEach((column, index) => {
    if (columns[index + 1] !== column + 1) {
      stops.push(
        `transparent 0 ${(from * 100) / drawn}%,currentColor 0 ${((column + 1) * 100) / drawn}%`,
      );
      from = columns[index + 1];
    }
  });
  return stops;
}

export function dotsStyle(
  rows: DotRows,
): React.CSSProperties & { readonly '--dot-columns': number } {
  const drawn = columnsDrawn(rows);
  const images: string[] = [];
  const places: string[] = [];
  rows.forEach((columns, row) => {
    if (columns.length > 0) {
      images.push(
        `linear-gradient(to right,${cells(columns, drawn).join(',')},transparent 0)`,
      );
      places.push(
        `0 ${rows.length > 1 ? (row * 100) / (rows.length - 1) : 0}%`,
      );
    }
  });
  return {
    '--dot-columns': drawn,
    backgroundImage: images.join(','),
    backgroundPosition: places.join(','),
  };
}

export const hasDots = (rows: DotRows | undefined): rows is DotRows =>
  rows?.some((columns) => columns.length > 0) === true;
