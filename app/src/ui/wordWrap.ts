import type { TextWidths } from './textWidths';

export const tabSize = 4;

export function tabStop(column: number): number {
  const next = column + tabSize - (column % tabSize);
  return next - column < 0.5 ? next + tabSize : next;
}

interface Blank {
  readonly column: number;
  readonly tab: boolean;
}

export interface RowBreak {
  readonly end: number;
  readonly blanks: readonly Blank[];
}

interface BlankRun {
  readonly column: number;
  readonly columns: number;
  readonly tab: boolean;
}

export function blankRuns(blanks: readonly Blank[]): BlankRun[] {
  const runs: BlankRun[] = [];
  for (const { column, tab } of blanks) {
    const last = runs.at(-1);
    if (
      last !== undefined &&
      !tab &&
      !last.tab &&
      last.column + last.columns === column
    ) {
      runs[runs.length - 1] = { ...last, columns: last.columns + 1 };
    } else {
      runs.push({ column, columns: 1, tab });
    }
  }
  return runs;
}

const blankKind = 1;
const breaksAfter = 2;
const breaksBefore = 4;
const kinds = new Uint8Array(128);
const kindOf = (characters: string, kind: number) => {
  for (const character of characters) {
    kinds[character.charCodeAt(0)] |= kind;
  }
};
kindOf(' \t', blankKind);
kindOf('})]?|/&.,;', breaksAfter);
kindOf('([{+', breaksBefore);
const fullWidthColumns = 2;
const tabCode = 9;

function kindAt(text: string, at: number): number {
  const code = text.charCodeAt(at);
  return code < kinds.length ? (kinds[code] ?? 0) : 0;
}

const isBlank = (character: string | undefined) =>
  character === ' ' || character === '\t';

const isBlankAt = (text: string, at: number) =>
  (kindAt(text, at) & blankKind) !== 0;

function breaksAt(text: string, at: number): boolean {
  const before = kindAt(text, at - 1);
  const after = kindAt(text, at);
  if (((before | after) & blankKind) !== 0) {
    return false;
  }
  const endsAfter = (before & breaksAfter) !== 0;
  const startsBefore = (after & breaksBefore) !== 0;
  return (
    (endsAfter && (after & breaksAfter) === 0) ||
    (startsBefore && (before & breaksBefore) === 0)
  );
}

export function breakOffsets(text: string): number[] {
  const offsets: number[] = [];
  for (let at = 1; at < text.length; at++) {
    if (breaksAt(text, at)) {
      offsets.push(at);
    }
  }
  return offsets;
}

export function leadLength(text: string): number {
  let at = 0;
  while (isBlank(text[at])) {
    at++;
  }
  return at;
}

export function wrapIndent(text: string, columns: number): number {
  const lead = leadLength(text);
  if (lead === text.length) {
    return 0;
  }
  let indent = 0;
  for (let at = 0; at < lead; at++) {
    indent = text[at] === '\t' ? tabStop(indent) : indent + 1;
  }
  const offStops = indent % tabSize !== 0 && text.includes('\t');
  return offStops || indent + fullWidthColumns > columns ? 0 : indent;
}

function startRowAt(starts: number[], text: string, at: number): void {
  const code = text.charCodeAt(at);
  const start = code >= 0xdc00 && code <= 0xdfff ? at - 1 : at;
  if (start > (starts.at(-1) ?? 0)) {
    starts.push(start);
  }
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

const wideBreaking =
  /[\p{Ideographic}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}]/u;

const keptBeforeNext = /[（「『【〔〈《［｛〘〖]$/u;

const keptAfterPrevious = /^[）」』】〕〉》］｝〙〗。、，．！？：；]/u;

function breaksBetween(before: string, after: string): boolean {
  return (
    (wideBreaking.test(before) || wideBreaking.test(after)) &&
    !keptBeforeNext.test(before) &&
    !keptAfterPrevious.test(after)
  );
}

const nonAscii = /[^\0-\x7f]/;

interface Cluster {
  readonly start: number;
  readonly text: string;
  readonly columns: number;
}

function measuredStarts(
  text: string,
  columns: number,
  indent: number,
  widths: TextWidths,
): number[] {
  const clusters: Cluster[] = Array.from(
    graphemes.segment(text),
    ({ segment, index }) => ({
      start: index,
      text: segment,
      columns: nonAscii.test(segment)
        ? widths.of(segment) / widths.char
        : segment.length,
    }),
  );
  const blank = (at: number) =>
    clusters[at].text === ' ' || clusters[at].text === '\t';
  const boxed = (at: number) => widths.boxed?.(clusters[at].text) !== undefined;
  const breaksAhead = (at: number) =>
    breaksAt(text, clusters[at].start) ||
    boxed(at - 1) ||
    boxed(at) ||
    breaksBetween(clusters[at - 1].text, clusters[at].text);
  const starts = [0];
  let column = 0;
  let rowStart = indent;
  let at = 0;
  while (at < clusters.length) {
    let end = at;
    while (
      end < clusters.length &&
      !blank(end) &&
      (end === at || !breaksAhead(end))
    ) {
      end++;
    }
    let width = 0;
    for (let each = at; each < end; each++) {
      width += clusters[each].columns;
    }
    if (width > 0 && column > rowStart && column + width > columns) {
      starts.push(clusters[at].start);
      column = indent;
      rowStart = indent;
    }
    let from = at;
    while (column + width > columns && from < end) {
      let fits = from;
      let used = 0;
      while (fits < end && column + used + clusters[fits].columns <= columns) {
        used += clusters[fits].columns;
        fits++;
      }
      if (fits === from) {
        used = clusters[from].columns;
        fits = from + 1;
      }
      if (fits === end) {
        break;
      }
      starts.push(clusters[fits].start);
      column = indent;
      rowStart = indent;
      width -= used;
      from = fits;
    }
    column += width;
    for (at = end; at < clusters.length && blank(at); at++) {
      column = clusters[at].text === '\t' ? tabStop(column) : column + 1;
    }
  }
  return starts;
}

export function wrapStarts(
  text: string,
  columns: number,
  indent = wrapIndent(text, columns),
  widths?: TextWidths,
): number[] {
  if (text.endsWith('\r')) {
    return wrapStarts(text.slice(0, -1), columns, indent, widths);
  }
  if (widths !== undefined && widths.char > 0 && nonAscii.test(text)) {
    return measuredStarts(text, columns, indent, widths);
  }
  if (text.length <= columns && !text.includes('\t')) {
    return [0];
  }
  const starts = [0];
  let column = 0;
  let rowStart = indent;
  let at = 0;
  while (at < text.length) {
    let end = at;
    while (
      end < text.length &&
      !isBlankAt(text, end) &&
      (end === at || !breaksAt(text, end))
    ) {
      end++;
    }
    let length = end - at;
    if (length > 0 && column > rowStart && column + length > columns) {
      starts.push(at);
      column = indent;
      rowStart = indent;
    }
    while (column + length > columns) {
      length -= columns - column;
      startRowAt(starts, text, end - length);
      column = indent;
      rowStart = indent;
    }
    column += length;
    for (at = end; isBlankAt(text, at); at++) {
      column = text.charCodeAt(at) === tabCode ? tabStop(column) : column + 1;
    }
  }
  return starts;
}

export function wrappedLines(
  text: string,
  columns: number,
  widths?: TextWidths,
): number {
  return wrapStarts(text, columns, undefined, widths).length;
}

const maxMarkedRows = 200;

export function markedRowStarts(
  length: number,
  rows: number,
  rowOf: (offset: number) => number,
): number[] {
  return rows > maxMarkedRows ? [0] : rowStarts(length, rows, rowOf);
}

export function rowStarts(
  length: number,
  rows: number,
  rowOf: (offset: number) => number,
): number[] {
  const read = new Map<number, number>();
  const rowAt = (offset: number) => {
    let row = read.get(offset);
    if (row === undefined) {
      row = rowOf(offset);
      read.set(offset, row);
    }
    return row;
  };
  const starts = [0];
  for (let row = 1; row < rows; row++) {
    const previous = starts[row - 1];
    const stride =
      row > 1 ? previous - starts[row - 2] : Math.ceil(length / rows);
    starts.push(
      firstOnRow(
        row,
        previous + 1,
        length,
        Math.min(previous + Math.max(1, stride), length),
        rowAt,
      ),
    );
  }
  return starts;
}

function firstOnRow(
  row: number,
  from: number,
  to: number,
  estimate: number,
  rowAt: (offset: number) => number,
): number {
  let low = from;
  let high = to;
  if (estimate >= to || rowAt(estimate) >= row) {
    high = Math.min(estimate, to);
    for (let gap = 1; high - gap >= from; gap *= 2) {
      if (rowAt(high - gap) < row) {
        low = high - gap + 1;
        break;
      }
      high -= gap;
    }
  } else {
    low = estimate + 1;
    for (let gap = 1; low + gap - 1 < to; gap *= 2) {
      const probe = low + gap - 1;
      if (rowAt(probe) >= row) {
        high = probe;
        break;
      }
      low = probe + 1;
    }
  }
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (rowAt(middle) >= row) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return low;
}

export type ColumnsIn = (row: string) => (index: number) => number;

function countedColumns(row: string): (index: number) => number {
  let at = 0;
  let column = 0;
  return (index) => {
    while (at < index) {
      column = row[at] === '\t' ? tabStop(column) : column + 1;
      at += (row.codePointAt(at) ?? 0) > 0xffff ? 2 : 1;
    }
    return column;
  };
}

export function rowBreaksAt(
  text: string,
  starts: readonly number[],
  columns: number,
  columnsIn: ColumnsIn = countedColumns,
  indent = 0,
): RowBreak[] {
  return starts.slice(1).map((next, index) => {
    const row = text.slice(starts[index], next);
    const start = index === 0 ? 0 : indent;
    const columnIn = columnsIn(row);
    const columnAt = (at: number) => start + columnIn(at);
    let blanks: Blank[] = [];
    for (let at = 0; at < row.length; at++) {
      const character = row[at];
      if (isBlank(character)) {
        blanks.push({ column: columnAt(at), tab: character === '\t' });
      } else {
        blanks = [];
      }
    }
    return {
      end: Math.min(columnAt(row.length), columns + 1),
      blanks: blanks.filter((blank) => blank.column <= columns),
    };
  });
}

export function wrapColumns(width: number, charWidth: number): number {
  if (charWidth <= 0) {
    return Infinity;
  }
  return Math.max(1, Math.floor(width / charWidth + 1e-6));
}
