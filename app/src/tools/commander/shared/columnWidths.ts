export const sizedColumns = ['extension', 'size', 'date'] as const;

export type SizedColumn = (typeof sizedColumns)[number];

export type ColumnWidths = Readonly<Record<SizedColumn, number>>;

export const maxColumnWidth = 100;

function heldWidth(width: number): number {
  return Math.min(maxColumnWidth, Math.max(1, Math.round(width)));
}

export function heldColumns(columns: ColumnWidths): ColumnWidths {
  return {
    extension: heldWidth(columns.extension),
    size: heldWidth(columns.size),
    date: heldWidth(columns.date),
  };
}

export function isColumnWidths(value: unknown): value is ColumnWidths {
  return (
    typeof value === 'object' &&
    value !== null &&
    sizedColumns.every((column) => {
      const width: unknown = Reflect.get(value, column);
      return (
        typeof width === 'number' &&
        Number.isInteger(width) &&
        width >= 1 &&
        width <= maxColumnWidth
      );
    })
  );
}
