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

export interface FileColor {
  readonly extensions: readonly string[];
  readonly colors: { readonly light: string; readonly dark: string };
}

export interface CommanderSettings {
  readonly showHidden: boolean;
  readonly sort: Sorts;
  readonly columns: ColumnWidths;
  readonly thumbnailSize: number;
  readonly thumbnailCacheMegabytes: number;
  readonly fileColors: readonly FileColor[];
}

export const layouts = ['details', 'thumbnails'] as const;

export type Layout = (typeof layouts)[number];

export type Layouts = Readonly<Record<'left' | 'right', Layout>>;

export const defaultLayouts: Layouts = { left: 'details', right: 'details' };

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
