export interface ChangeMark {
  readonly kind: 'added' | 'removed' | 'match';
  readonly top: number;
  readonly height: number;
}

export interface MarkedRow {
  readonly height: number;
  readonly change: 'added' | 'removed' | undefined;
}

function runMarks(
  rows: readonly MarkedRow[],
  kindOf: (row: MarkedRow, index: number) => ChangeMark['kind'] | undefined,
): ChangeMark[] {
  const total = rows.reduce((sum, row) => sum + row.height, 0);
  if (total === 0) {
    return [];
  }
  const marks: ChangeMark[] = [];
  let offset = 0;
  let run: { kind: ChangeMark['kind']; start: number; end: number } | undefined;
  const close = () => {
    if (run) {
      marks.push({
        kind: run.kind,
        top: run.start / total,
        height: (run.end - run.start) / total,
      });
      run = undefined;
    }
  };
  rows.forEach((row, index) => {
    const kind = kindOf(row, index);
    if (kind === undefined || kind !== run?.kind) {
      close();
    }
    if (kind !== undefined) {
      run ??= { kind, start: offset, end: offset };
      run.end = offset + row.height;
    }
    offset += row.height;
  });
  close();
  return marks;
}

export function changedMarks(rows: readonly MarkedRow[]): ChangeMark[] {
  return runMarks(rows, (row) => row.change);
}

export function matchMarks(
  rows: readonly MarkedRow[],
  found: ReadonlySet<number>,
): ChangeMark[] {
  return runMarks(rows, (_, index) => (found.has(index) ? 'match' : undefined));
}

export function marksScale(total: number, viewport: number): number {
  return total > 0 && total < viewport ? total / viewport : 1;
}
