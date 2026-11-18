import { tabStop } from './tabStops';
import { isBlank } from './wordWrap';

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

export function spaceColumnsAt(
  text: string,
  starts: readonly number[],
  columns: number,
  columnsIn: ColumnsIn = countedColumns,
  indent = 0,
): number[][] {
  return starts.map((from, index) => {
    const row = text.slice(from, starts[index + 1]);
    const start = index === 0 ? 0 : indent;
    const columnIn = columnsIn(row);
    const found: number[] = [];
    for (let at = row.indexOf(' '); at !== -1; at = row.indexOf(' ', at + 1)) {
      const column = start + columnIn(at);
      if (column <= columns) {
        found.push(column);
      }
    }
    return found;
  });
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
