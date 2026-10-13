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

export function wrappedLines(text: string, columns: number): number {
  if (text.length <= columns && !text.includes('\t')) {
    return 1;
  }
  let lines = 1;
  let column = 0;
  for (const [, word, spaces] of text.matchAll(/([^ \t]*)([ \t]*)/g)) {
    let length = word.length;
    if (length > 0 && column > 0 && column + length > columns) {
      lines++;
      column = 0;
    }
    while (length > columns) {
      length -= columns;
      lines++;
    }
    column += length;
    for (const space of spaces) {
      column = space === '\t' ? tabStop(column) : column + 1;
    }
  }
  return lines;
}

export function rowStarts(
  length: number,
  rows: number,
  rowOf: (offset: number) => number,
): number[] {
  const starts = [0];
  for (let row = 1; row < rows; row++) {
    let low = starts[row - 1] + 1;
    let high = length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (rowOf(middle) >= row) {
        high = middle;
      } else {
        low = middle + 1;
      }
    }
    starts.push(low);
  }
  return starts;
}

export function rowBreaksAt(
  text: string,
  starts: readonly number[],
  columns: number,
): RowBreak[] {
  return starts.slice(1).map((next, index) => {
    let column = 0;
    let blanks: Blank[] = [];
    for (const character of text.slice(starts[index], next)) {
      if (character === ' ' || character === '\t') {
        const tab = character === '\t';
        blanks.push({ column, tab });
        column = tab ? tabStop(column) : column + 1;
      } else {
        blanks = [];
        column++;
      }
    }
    return {
      end: Math.min(column, columns + 1),
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
