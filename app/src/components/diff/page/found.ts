import type { FindMatch, FindRange } from './find';
import { revealFound, sideArea, type Sideways } from './overflow';
import type { TextWidths } from '../../../lib/page/textWidths';
import type { DiffRow } from './rows';
import type { Edges } from './textLayout';

export function foundScroll(
  row: DiffRow,
  found: FindMatch,
  view: Sideways,
  widths: TextWidths,
): number | undefined {
  switch (row.kind) {
    case 'line':
      return revealFound(view, sideArea(view), row.line.text, found, widths);
    case 'wholeLine':
      return revealFound(view, sideArea(view), row.text, found, widths);
    case 'split': {
      const right = row.right?.index === found.line;
      const cell = right ? row.right : row.left;
      return (
        cell && revealFound(view, sideArea(view), cell.line.text, found, widths)
      );
    }
    default:
      return undefined;
  }
}

export function foundMiddle(
  found: Edges,
  view: Edges,
  row: { readonly top: number; readonly start: number },
): number | undefined {
  if (found.top >= view.top && found.bottom <= view.bottom) {
    return undefined;
  }
  return row.start + (found.top + found.bottom) / 2 - row.top;
}

export function foundRows(
  parts: readonly { readonly from: number; readonly to: number }[],
  { start, end }: FindRange,
  lineHeight: number,
): Edges {
  const reached = parts.findIndex((part) => part.to > start);
  const first = reached === -1 ? Math.max(0, parts.length - 1) : reached;
  const last = Math.max(
    first,
    parts.findLastIndex((part) => part.from < end),
  );
  return { top: first * lineHeight, bottom: (last + 1) * lineHeight };
}
