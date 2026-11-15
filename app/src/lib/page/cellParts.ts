import { graphemes, nonAscii } from './graphemes';
import type { TextWidths } from './textWidths';

const cellClasses = ['cell zero', 'cell', 'cell wide'];

export const cellClass = (cells: number): string =>
  cellClasses[cells] ?? 'cell';

export type CellPart =
  | { readonly text: string; readonly cells?: undefined }
  | {
      readonly text: string;
      readonly cells: number;
      readonly scale: number | undefined;
    };

export function cellParts(text: string, widths: TextWidths): CellPart[] {
  if (widths.boxed === undefined || !nonAscii.test(text)) {
    return [{ text }];
  }
  const parts: CellPart[] = [];
  let plain = '';
  for (const { segment } of graphemes.segment(text)) {
    const cells = nonAscii.test(segment) ? widths.boxed(segment) : undefined;
    if (cells === undefined) {
      plain += segment;
      continue;
    }
    if (plain !== '') {
      parts.push({ text: plain });
      plain = '';
    }
    parts.push({ text: segment, cells, scale: widths.scaled?.(segment) });
  }
  if (plain !== '') {
    parts.push({ text: plain });
  }
  return parts;
}
