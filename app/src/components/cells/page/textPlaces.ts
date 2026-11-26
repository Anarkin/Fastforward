import { blankSignOf } from './blankSigns';
import { clusterBreak } from '../../../lib/page/graphemes';
import { invisibleParts } from '../../../lib/page/invisibles';
import { widthsFor, type TextWidths } from '../../../lib/page/textWidths';
import { strings } from '../../../lib/shared/strings';
import { charAtColumn, columnAt } from './columns';
import type { ScreenRow } from './lines';

export function rowHolding(
  rows: readonly ScreenRow[],
  char: number,
  assoc: number,
): number {
  let found = 0;
  for (const [index, row] of rows.entries()) {
    if (char > row.from || (char === row.from && (assoc >= 0 || index === 0))) {
      found = index;
    }
  }
  return found;
}

export function columnIn(
  widths: TextWidths | undefined,
  text: string,
  row: ScreenRow,
  char: number,
): number {
  return (
    row.indent +
    columnAt(
      text,
      Math.min(char, text.length),
      row.from,
      widthsFor(text, widths),
    )
  );
}

export function charAt(
  widths: TextWidths | undefined,
  text: string,
  row: ScreenRow,
  column: number,
): number {
  return charAtColumn(
    text,
    row.from,
    row.to,
    row.indent,
    column,
    widthsFor(text, widths),
  );
}

export function cellsAt(
  widths: TextWidths | undefined,
  text: string,
  row: ScreenRow,
  char: number,
): number {
  const next = char >= row.to ? char : clusterBreak(text, char, true);
  return next <= char
    ? 1
    : Math.max(
        1,
        columnIn(widths, text, row, next) - columnIn(widths, text, row, char),
      );
}

export const endingSignsOf = (ending: string): string =>
  ending
    .replaceAll('\r', strings.symbols.carriageReturn)
    .replaceAll('\n', strings.symbols.lineFeed);

export function underAt(text: string, char: number): string {
  return char >= text.length
    ? ''
    : shownUnder(text.slice(char, clusterBreak(text, char, true)));
}

export interface SeenCell {
  readonly column: number;
  readonly text: string;
}

export function seenCells(
  widths: TextWidths | undefined,
  text: string,
  row: ScreenRow,
): SeenCell[] {
  const cells: SeenCell[] = [];
  for (let at = row.from; at < row.to;) {
    const next = clusterBreak(text, at, true);
    const cluster = text.slice(at, next);
    cells.push({
      column: columnIn(widths, text, row, at),
      text: cluster === '\t' ? ' ' : shownUnder(cluster),
    });
    at = Math.max(next, at + 1);
  }
  return cells;
}

export function shownUnder(text: string): string {
  if (text === '\t') {
    return '';
  }
  const parts = invisibleParts(text);
  return parts === undefined
    ? (blankSignOf(text, false) ?? text)
    : parts
        .map(({ text: part, hidden }) =>
          hidden ? strings.symbols.invisible : part,
        )
        .join('');
}
