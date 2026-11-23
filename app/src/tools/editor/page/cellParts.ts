import { graphemes, nonAscii, standsAlone } from '../../../lib/page/graphemes';
import type { TextWidths } from '../../../lib/page/textWidths';

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

interface Stretch {
  readonly from: number;
  to: number;
  joined: boolean;
}

function stretchesBeyondAscii(text: string): Stretch[] {
  const stretches: Stretch[] = [];
  for (const run of text.matchAll(beyondAscii)) {
    const from = Math.max(0, run.index - 1);
    const to = Math.min(text.length, run.index + run[0].length + 1);
    const joined = run[0].length > 1 || !standsAlone(run[0]);
    const last = stretches.at(-1);
    if (last !== undefined && from <= last.to) {
      last.to = to;
      last.joined ||= joined;
    } else {
      stretches.push({ from, to, joined });
    }
  }
  return stretches;
}

const clustersOf = (stretch: string, joined: boolean): Iterable<string> =>
  joined
    ? Array.from(graphemes.segment(stretch), ({ segment }) => segment)
    : stretch;

export function cellParts(text: string, widths: TextWidths): CellPart[] {
  if (widths.boxed === undefined || !nonAscii.test(text)) {
    return [{ text }];
  }
  const parts: CellPart[] = [];
  let plain = '';
  let taken = 0;
  for (const { from, to, joined } of stretchesBeyondAscii(text)) {
    plain += text.slice(taken, from);
    taken = to;
    for (const cluster of clustersOf(text.slice(from, to), joined)) {
      const cells = nonAscii.test(cluster) ? widths.boxed(cluster) : undefined;
      if (cells === undefined) {
        plain += cluster;
        continue;
      }
      if (plain !== '') {
        parts.push({ text: plain });
        plain = '';
      }
      parts.push({ text: cluster, cells, scale: widths.scaled?.(cluster) });
    }
  }
  plain += text.slice(taken);
  if (plain !== '') {
    parts.push({ text: plain });
  }
  return parts;
}
