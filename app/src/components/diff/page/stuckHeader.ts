import type { DiffRow, FileHeaderRow } from './rows';

export function scrollOnToggle(
  rows: readonly DiffRow[],
  row: FileHeaderRow,
  stuck: boolean,
): number | undefined {
  return stuck ? fileHeaderIndex(rows, row.file) : undefined;
}

export function stuckHeader(
  rows: readonly DiffRow[],
  items: readonly { index: number; start: number; end: number }[],
  scrollTop: number,
): FileHeaderRow | undefined {
  const top = items.find((item) => item.end > scrollTop);
  if (top === undefined) {
    return undefined;
  }
  const topRow = rows[top.index];
  if (
    !('file' in topRow) ||
    (topRow.kind === 'file' && top.start >= scrollTop)
  ) {
    return undefined;
  }
  const header = rows[fileHeaderIndex(rows, topRow.file)];
  return header?.kind === 'file' ? header : undefined;
}

function fileHeaderIndex(rows: readonly DiffRow[], file: number): number {
  return rows.findIndex((row) => row.kind === 'file' && row.file === file);
}
