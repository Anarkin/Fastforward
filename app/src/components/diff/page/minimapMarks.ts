export interface MinimapMark {
  readonly kind: 'added' | 'removed' | 'match';
  readonly top: number;
  readonly height: number;
}

export interface MinimapRow {
  readonly height: number;
  readonly change: 'added' | 'removed' | undefined;
}

function runMarks(
  rows: readonly MinimapRow[],
  kindOf: (row: MinimapRow, index: number) => MinimapMark['kind'] | undefined,
): MinimapMark[] {
  const total = rows.reduce((sum, row) => sum + row.height, 0);
  if (total === 0) {
    return [];
  }
  const marks: MinimapMark[] = [];
  let offset = 0;
  let run:
    { kind: MinimapMark['kind']; start: number; end: number } | undefined;
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

export function minimapMarks(rows: readonly MinimapRow[]): MinimapMark[] {
  return runMarks(rows, (row) => row.change);
}

export function matchMarks(
  rows: readonly MinimapRow[],
  found: ReadonlySet<number>,
): MinimapMark[] {
  return runMarks(rows, (_, index) => (found.has(index) ? 'match' : undefined));
}
