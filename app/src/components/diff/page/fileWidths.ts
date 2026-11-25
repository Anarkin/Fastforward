import { withTabSize, type TextWidths } from '../../../lib/page/textWidths';
import type { DiffRow } from './rows';

export type TabSizeOf = (file: number) => number | undefined;

export function rowWidths(
  widths: TextWidths,
  tabSizeOf: TabSizeOf | undefined,
  row: DiffRow | undefined,
): TextWidths {
  return tabSizeOf === undefined || row === undefined || !('file' in row)
    ? widths
    : withTabSize(widths, tabSizeOf(row.file));
}
