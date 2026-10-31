export const sortColumns = ['name', 'extension', 'size', 'date'] as const;

export type SortColumn = (typeof sortColumns)[number];

export interface Sort {
  readonly column: SortColumn;
  readonly descending: boolean;
}

export const sizedColumns = ['extension', 'size', 'date'] as const;

export type SizedColumn = (typeof sizedColumns)[number];

export type ColumnWidths = Readonly<Record<SizedColumn, number>>;

export const maxColumnWidth = 100;

export type Sorts = Readonly<Record<'left' | 'right', Sort>>;

export interface CommanderSettings {
  readonly showHidden: boolean;
  readonly sort: Sorts;
  readonly columns: ColumnWidths;
}

export function isSort(value: unknown): value is Sort {
  return (
    typeof value === 'object' &&
    value !== null &&
    sortColumns.some((column) => column === Reflect.get(value, 'column')) &&
    typeof Reflect.get(value, 'descending') === 'boolean'
  );
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
