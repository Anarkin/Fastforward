import { wordAround } from '../../../lib/shared/textMatches';
import type { TextRow } from '../shared/protocol';

export interface TextPlace {
  readonly start: number;
  readonly char: number;
}

export interface TextSelection {
  readonly anchor: TextPlace;
  readonly focus: TextPlace;
}

export interface CharRange {
  readonly from: number;
  readonly to: number;
}

const newline = '\n';

const before = (one: TextPlace, other: TextPlace) =>
  one.start < other.start ||
  (one.start === other.start && one.char < other.char);

export function ordered({ anchor, focus }: TextSelection): {
  readonly first: TextPlace;
  readonly last: TextPlace;
} {
  return before(focus, anchor)
    ? { first: focus, last: anchor }
    : { first: anchor, last: focus };
}

export const isEmpty = ({ anchor, focus }: TextSelection): boolean =>
  anchor.start === focus.start && anchor.char === focus.char;

export function selectedIn(
  selection: TextSelection | undefined,
  row: Pick<TextRow, 'start'>,
  shown: CharRange,
): CharRange | undefined {
  if (selection === undefined) {
    return undefined;
  }
  const { first, last } = ordered(selection);
  if (row.start < first.start || row.start > last.start) {
    return undefined;
  }
  const from = Math.max(shown.from, row.start === first.start ? first.char : 0);
  const to = Math.min(
    shown.to,
    row.start === last.start ? last.char : Infinity,
  );
  return to > from ? { from, to } : undefined;
}

export function wordAt(
  row: Pick<TextRow, 'start' | 'text'>,
  char: number,
): TextSelection {
  const word = wordAround(row.text, char);
  const from = word?.start ?? Math.min(char, Math.max(0, row.text.length - 1));
  const to = word?.end ?? Math.min(row.text.length, from + 1);
  return {
    anchor: { start: row.start, char: from },
    focus: { start: row.start, char: to },
  };
}

export function lineAt(row: Pick<TextRow, 'start' | 'text'>): TextSelection {
  return {
    anchor: { start: row.start, char: 0 },
    focus: { start: row.start, char: row.text.length },
  };
}

export function selectedText(
  selection: TextSelection,
  rows: readonly TextRow[],
): string {
  const { first, last } = ordered(selection);
  let text = '';
  for (const row of rows) {
    if (row.start < first.start || row.start > last.start) {
      continue;
    }
    const ends = row.start === last.start;
    text += row.text.slice(
      row.start === first.start ? first.char : 0,
      ends ? last.char : undefined,
    );
    if (!ends && row.cut !== true) {
      text += newline;
    }
  }
  return text;
}
