import { strings } from '../../../shared/strings';

export const sortColumns = ['name', 'extension', 'size', 'date'] as const;

export type SortColumn = (typeof sortColumns)[number];

export interface Sort {
  readonly column: SortColumn;
  readonly descending: boolean;
  readonly groupByColor: boolean;
}

export const sizedColumns = ['extension', 'size', 'date'] as const;

export type SizedColumn = (typeof sizedColumns)[number];

export type ColumnWidths = Readonly<Record<SizedColumn, number>>;

export const maxColumnWidth = 100;

export type Sorts = Readonly<Record<'left' | 'right', Sort>>;

export const languagesGroup = 'languages';

export interface FileColor {
  readonly extensions: readonly string[] | typeof languagesGroup;
  readonly colors: { readonly light: string; readonly dark: string };
}

export interface CommanderSettings {
  readonly showHidden: boolean;
  readonly sort: Sorts;
  readonly columns: ColumnWidths;
  readonly thumbnailSize: number;
  readonly thumbnailCacheMegabytes: number;
  readonly fileColors: readonly FileColor[];
  readonly bookmarks: readonly string[];
}

export function extensionKey(extension: string): string {
  return extension.replace(/^\./, '').toLowerCase();
}

export function fileColorProblems(groups: readonly FileColor[]): string[] {
  const firstGroup = new Map<string, number>();
  let languages: number | undefined;
  return groups.flatMap(({ extensions }, group) => {
    if (extensions === languagesGroup) {
      if (languages === undefined) {
        languages = group;
        return [];
      }
      return [strings.settings.fileColorLanguagesTwice(languages, group)];
    }
    return extensions.flatMap((extension) => {
      const key = extensionKey(extension);
      if (key === '') {
        return [strings.settings.fileColorEmpty(group)];
      }
      const first = firstGroup.get(key);
      if (first === undefined) {
        firstGroup.set(key, group);
        return [];
      }
      return first === group
        ? []
        : [strings.settings.fileColorTwice(key, first, group)];
    });
  });
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
    typeof Reflect.get(value, 'descending') === 'boolean' &&
    typeof Reflect.get(value, 'groupByColor') === 'boolean'
  );
}

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
