import type { Sorts } from './sorts';
import type { ColumnWidths } from './columnWidths';
import type { FileColor } from '../../../lib/shared/fileColors';

export interface CommanderSettings {
  readonly showHidden: boolean;
  readonly sort: Sorts;
  readonly columns: ColumnWidths;
  readonly thumbnailSize: number;
  readonly thumbnailCacheMegabytes: number;
  readonly fileColors: readonly FileColor[];
  readonly bookmarks: readonly string[];
}
