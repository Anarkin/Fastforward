import type { FindMatch } from './find';
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

export function foundEdges(element: Element): Edges | undefined {
  const marks = Array.from(
    element.querySelectorAll('mark.find-match.current'),
    (mark) => mark.getBoundingClientRect(),
  );
  return marks.length === 0
    ? undefined
    : {
        top: Math.min(...marks.map((mark) => mark.top)),
        bottom: Math.max(...marks.map((mark) => mark.bottom)),
      };
}
