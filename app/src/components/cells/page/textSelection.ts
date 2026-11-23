import { wordAround } from '../../../lib/shared/textMatches';
import type { TextLine } from './lines';

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
  row: Pick<TextLine, 'start'>,
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

const noRanges: readonly CharRange[] = [];

export function selectedAmong(
  selections: readonly (TextSelection | undefined)[],
  row: Pick<TextLine, 'start'>,
  shown: CharRange,
): readonly CharRange[] {
  let found: CharRange[] | undefined;
  for (const selection of selections) {
    const range = selectedIn(selection, row, shown);
    if (range !== undefined) {
      (found ??= []).push(range);
    }
  }
  return found === undefined
    ? noRanges
    : found.toSorted((one, other) => one.from - other.from);
}

export function breakSelected(
  selection: TextSelection | undefined,
  row: Pick<TextLine, 'start' | 'end'>,
): boolean {
  if (selection === undefined) {
    return false;
  }
  const { first, last } = ordered(selection);
  return (
    row.start >= first.start &&
    (last.start > row.end || (last.start === row.end && last.char > 0))
  );
}

export function wordAt(
  row: Pick<TextLine, 'start' | 'text'>,
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

export function lineAt(row: Pick<TextLine, 'start' | 'text'>): TextSelection {
  return {
    anchor: { start: row.start, char: 0 },
    focus: { start: row.start, char: row.text.length },
  };
}

export function selectedText(
  selection: TextSelection,
  rows: readonly TextLine[],
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

export interface KeptText {
  readonly selection: TextSelection;
  readonly text: string;
}

const same = (one: TextPlace, other: TextPlace) =>
  one.start === other.start && one.char === other.char;

function holds(
  rows: readonly TextLine[],
  from: TextPlace,
  to: TextPlace,
): boolean {
  const first = rows[0]?.start;
  const last = rows.at(-1)?.start;
  return (
    first !== undefined &&
    last !== undefined &&
    from.start >= first &&
    to.start <= last
  );
}

export function keptText(
  kept: KeptText | undefined,
  selection: TextSelection,
  rows: readonly TextLine[],
): string | undefined {
  const { first, last } = ordered(selection);
  if (holds(rows, first, last)) {
    return selectedText(selection, rows);
  }
  const { anchor, focus } = selection;
  if (kept === undefined || !same(kept.selection.anchor, anchor)) {
    return undefined;
  }
  const was = kept.selection.focus;
  if (same(was, focus)) {
    return kept.text;
  }
  const onward = before(was, focus);
  const [from, to] = onward ? [was, focus] : [focus, was];
  if (!holds(rows, from, to)) {
    return undefined;
  }
  const between = selectedText({ anchor: from, focus: to }, rows);
  if (before(from, anchor)) {
    return onward ? kept.text.slice(between.length) : between + kept.text;
  }
  return onward
    ? kept.text + between
    : kept.text.slice(0, kept.text.length - between.length);
}
