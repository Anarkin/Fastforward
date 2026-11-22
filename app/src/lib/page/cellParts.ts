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

const beyondAscii = /[^\0-\x7f]+/g;

function stretchesBeyondAscii(text: string): [number, number][] {
  const stretches: [number, number][] = [];
  for (const run of text.matchAll(beyondAscii)) {
    const from = Math.max(0, run.index - 1);
    const to = Math.min(text.length, run.index + run[0].length + 1);
    const last = stretches.at(-1);
    if (last !== undefined && from <= last[1]) {
      last[1] = to;
    } else {
      stretches.push([from, to]);
    }
  }
  return stretches;
}

export function cellParts(text: string, widths: TextWidths): CellPart[] {
  if (widths.boxed === undefined || !nonAscii.test(text)) {
    return [{ text }];
  }
  const parts: CellPart[] = [];
  let plain = '';
  let taken = 0;
  for (const [from, to] of stretchesBeyondAscii(text)) {
    plain += text.slice(taken, from);
    taken = to;
    for (const { segment } of graphemes.segment(text.slice(from, to))) {
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
  }
  plain += text.slice(taken);
  if (plain !== '') {
    parts.push({ text: plain });
  }
  return parts;
}
