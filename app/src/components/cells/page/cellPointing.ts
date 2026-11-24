import type { ScreenRow } from './lines';
import type { TextLine } from './lines';
import type { ShownRows } from './cellPainting';
import { charAtColumn, unitAtColumn } from './columns';
import {
  lineAt,
  ordered,
  wordAt,
  type SelectionShape,
  type TextPlace,
  type TextSelection,
} from './textSelection';

export interface Under {
  readonly place: TextPlace;
  readonly row: TextLine;
}

function rowAt(tops: readonly number[], y: number): number {
  let low = 0;
  let high = tops.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((tops[middle] ?? 0) <= y) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low - 1;
}

export function placeUnder(
  { rows, parts, widths, first, tops, left = 0 }: ShownRows,
  advance: number,
  rowHeight: number,
  x: number,
  y: number,
): Under | undefined {
  const index = Math.min(
    rows.length - 1,
    Math.max(
      0,
      tops === undefined ? Math.floor(y / rowHeight) : rowAt(tops, y),
    ),
  );
  const row = rows[index];
  if (row === undefined) {
    return undefined;
  }
  const part = parts[index];
  return {
    row: row.row,
    place: {
      start: row.row.start,
      char: charAtColumn(
        row.row.text,
        part?.from ?? row.from,
        part?.to ?? row.to,
        part?.column ?? 0,
        (x - left) / advance + first,
        widths,
      ),
    },
  };
}

export interface UnitUnder {
  readonly text: string;
  readonly key: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function unitUnder(
  { rows, parts, widths, first, tops, left = 0 }: ShownRows,
  advance: number,
  rowHeight: number,
  x: number,
  y: number,
): UnitUnder | undefined {
  if (y < 0) {
    return undefined;
  }
  const index = tops === undefined ? Math.floor(y / rowHeight) : rowAt(tops, y);
  const row = rows[index];
  const top = tops?.[index] ?? index * rowHeight;
  if (row === undefined || y >= top + rowHeight) {
    return undefined;
  }
  const part = parts[index];
  const unit = unitAtColumn(
    row.row.text,
    part?.from ?? row.from,
    part?.to ?? row.to,
    part?.column ?? 0,
    (x - left) / advance + first,
    widths,
  );
  return unit === undefined
    ? undefined
    : {
        text: row.row.text.slice(unit.from, unit.to),
        key: `${row.row.start}:${unit.from}`,
        left: left + (unit.column - first) * advance,
        top,
        width: unit.columns * advance,
        height: rowHeight,
      };
}

export function pressed(
  before: TextSelection | undefined,
  under: Under,
  clicks: number,
  extending: boolean,
  shape?: SelectionShape,
): TextSelection {
  const placedLike = (like: TextPlace | undefined): TextPlace =>
    shape === undefined
      ? under.place
      : {
          start: under.place.start,
          char: shape.placed(under.row, under.place.char, like),
        };
  if (extending && before !== undefined) {
    return { anchor: before.anchor, focus: placedLike(before.anchor) };
  }
  if (clicks === 2) {
    return (shape?.word ?? wordAt)(under.row, under.place.char);
  }
  if (clicks >= 3) {
    return shape === undefined
      ? lineAt(under.row)
      : shape.line(under.row, under.place.char);
  }
  const place = placedLike(undefined);
  return { anchor: place, focus: place };
}

export function placedUnder(
  under: Under,
  like: TextPlace,
  shape: SelectionShape | undefined,
): TextPlace {
  return shape === undefined
    ? under.place
    : {
        start: under.place.start,
        char: shape.placed(under.row, under.place.char, like),
      };
}

export function heldRows(held: readonly ScreenRow[]): TextLine[] {
  const rows: TextLine[] = [];
  for (const { row } of held) {
    if (rows.at(-1) !== row) {
      rows.push(row);
    }
  }
  return rows;
}

export function stillHeld(
  selection: TextSelection,
  held: readonly ScreenRow[],
): boolean {
  const { first, last } = ordered(selection);
  const start = held[0]?.row.start;
  const end = held.at(-1)?.row.start;
  return (
    start !== undefined &&
    end !== undefined &&
    first.start >= start &&
    last.start <= end
  );
}

const mostRowsAStep = 5;

export function reach(y: number, height: number, rowHeight: number): number {
  const past = y < 0 ? y : y > height ? y - height : 0;
  return past === 0
    ? 0
    : Math.sign(past) *
        Math.min(mostRowsAStep, Math.ceil(Math.abs(past) / rowHeight));
}
