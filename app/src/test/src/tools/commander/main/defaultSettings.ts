import type { ColumnWidths } from '../../../../../tools/commander/shared/columnWidths';
import type { Sorts } from '../../../../../tools/commander/shared/sorts';

export const defaultColumns: ColumnWidths = {
  extension: 10,
  size: 15,
  date: 16,
};

export const defaultSorts: Sorts = {
  left: { column: 'extension', descending: false, groupByColor: false },
  right: { column: 'extension', descending: false, groupByColor: false },
};
