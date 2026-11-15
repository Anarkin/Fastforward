import type { DiffRow } from './diffRows';

export function rowAnchors(
  rows: readonly DiffRow[],
  lines: readonly (readonly string[])[],
): (readonly string[])[] {
  const hunks = new Map<number, number>();
  return rows.map((row, index) => {
    if (lines[index].length > 0) {
      return lines[index];
    }
    if (row.kind === 'hunk') {
      const hunk = (hunks.get(row.file) ?? 0) + 1;
      hunks.set(row.file, hunk);
      return [`${row.file}:hunk:${hunk}`];
    }
    return ['file' in row ? `${row.file}:${row.kind}` : row.kind];
  });
}

export interface ScrollAnchor {
  readonly shows: readonly string[];
  readonly fraction: number;
}

type Laid = readonly { readonly start: number; readonly size: number }[];

export function scrollAnchor(
  rows: Laid,
  shown: readonly (readonly string[])[],
  scrollTop: number,
): ScrollAnchor | undefined {
  let low = 0;
  let high = rows.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (rows[middle].start <= scrollTop) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  const row = rows.at(low);
  const shows = shown.at(low);
  if (!row || !shows) {
    return undefined;
  }
  return {
    shows,
    fraction: row.size > 0 ? (scrollTop - row.start) / row.size : 0,
  };
}

export function anchoredScrollTop(
  anchor: ScrollAnchor,
  rows: Laid,
  shown: readonly (readonly string[])[],
): number | undefined {
  const index = shown.findIndex((shows) =>
    shows.some((id) => anchor.shows.includes(id)),
  );
  const row = index === -1 ? undefined : rows.at(index);
  return (
    row &&
    row.start + Math.min(anchor.fraction * row.size, Math.max(0, row.size - 1))
  );
}
