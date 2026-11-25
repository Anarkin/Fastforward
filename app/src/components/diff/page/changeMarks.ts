import { tickJoiner, type TickJoiner } from '../../../lib/page/scrollbarTicks';

export interface ChangeMark {
  readonly kind: 'added' | 'removed' | 'match' | 'current';
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
  least: number,
): ChangeMark[] {
  const total = rows.reduce((sum, row) => sum + row.height, 0);
  if (total === 0) {
    return [];
  }
  const joiners = new Map<ChangeMark['kind'], TickJoiner>();
  let offset = 0;
  let run: { kind: ChangeMark['kind']; start: number; end: number } | undefined;
  const close = () => {
    if (run) {
      const joiner = joiners.get(run.kind) ?? tickJoiner(least);
      joiners.set(run.kind, joiner);
      joiner.add(run.start / total, run.end / total);
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
  return [...joiners]
    .flatMap(([kind, joiner]) =>
      joiner.ticks().map((tick) => ({ kind, ...tick })),
    )
    .toSorted((one, other) => one.top - other.top);
}

export function changedMarks(
  rows: readonly MarkedRow[],
  least: number,
): ChangeMark[] {
  return runMarks(rows, (row) => row.change, least);
}

export function matchMarks(
  rows: readonly MarkedRow[],
  found: ReadonlySet<number>,
  least: number,
): ChangeMark[] {
  return runMarks(
    rows,
    (_, index) => (found.has(index) ? 'match' : undefined),
    least,
  );
}
