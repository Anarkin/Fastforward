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

const breaksAfter = new Set('})]?|/&.,;');
const breaksBefore = new Set('([{+');
const fullWidthColumns = 2;

const isBlank = (character: string | undefined) =>
  character === ' ' || character === '\t';

export function breakOffsets(text: string): number[] {
  const offsets: number[] = [];
  for (let at = 1; at < text.length; at++) {
    const before = text[at - 1];
    const after = text[at];
    if (
      !isBlank(before) &&
      !isBlank(after) &&
      ((breaksAfter.has(before) && !breaksAfter.has(after)) ||
        (!breaksBefore.has(before) && breaksBefore.has(after)))
    ) {
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

export function wrappedLines(text: string, columns: number): number {
  if (text.length <= columns && !text.includes('\t')) {
    return 1;
  }
  const indent = wrapIndent(text, columns);
  const breaks = new Set(breakOffsets(text));
  let lines = 1;
  let column = 0;
  let rowStart = indent;
  let at = 0;
  while (at < text.length) {
    let end = at;
    while (
      end < text.length &&
      !isBlank(text[end]) &&
      (end === at || !breaks.has(end))
    ) {
      end++;
    }
    let length = end - at;
    if (length > 0 && column > rowStart && column + length > columns) {
      lines++;
      column = indent;
      rowStart = indent;
    }
    while (column + length > columns) {
      length -= columns - column;
      lines++;
      column = indent;
      rowStart = indent;
    }
    column += length;
    for (at = end; isBlank(text[at]); at++) {
      column = text[at] === '\t' ? tabStop(column) : column + 1;
    }
  }
  return lines;
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
