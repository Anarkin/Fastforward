export const sortColumns = ['name', 'extension', 'size', 'date'] as const;

export type SortColumn = (typeof sortColumns)[number];

export interface Sort {
  readonly column: SortColumn;
  readonly descending: boolean;
  readonly groupByColor: boolean;
}

export type Sorts = Readonly<Record<'left' | 'right', Sort>>;

export function isSort(value: unknown): value is Sort {
  return (
    typeof value === 'object' &&
    value !== null &&
    sortColumns.some((column) => column === Reflect.get(value, 'column')) &&
    typeof Reflect.get(value, 'descending') === 'boolean' &&
    typeof Reflect.get(value, 'groupByColor') === 'boolean'
  );
}
