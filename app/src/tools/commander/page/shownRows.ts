import { filterWords, matchesFilter } from '../../../lib/page/fileFilter';
import type { Side } from '../shared/sides';
import type { ColumnWidths } from '../shared/columnWidths';
import type { CommanderSource } from './commanderState';
import type { Row } from './listing';
import { filterOf } from './sideFilters';

export function shownColumns({ view, resized }: CommanderSource): ColumnWidths {
  return resized !== undefined && resized.from === view.columns
    ? resized.widths
    : view.columns;
}

export interface DuplicateRows {
  readonly rows: readonly Row[];
  readonly starts: ReadonlySet<string>;
}

export function duplicateRows(
  rows: readonly Row[],
  groups: readonly (readonly string[])[],
): DuplicateRows {
  const groupOf = new Map<string, number>();
  for (const [index, group] of groups.entries()) {
    for (const key of group) {
      groupOf.set(key, index);
    }
  }
  const shown = new Map<number, Row[]>();
  const kept: Row[] = [];
  for (const row of rows) {
    const group = groupOf.get(row.key);
    if (row.entry === undefined) {
      kept.push(row);
    } else if (group !== undefined) {
      const together = shown.get(group);
      if (together === undefined) {
        shown.set(group, [row]);
      } else {
        together.push(row);
      }
    }
  }
  const starts = new Set<string>();
  for (const together of shown.values()) {
    if (together.length > 1) {
      starts.add(together[0].key);
      kept.push(...together);
    }
  }
  return { rows: kept, starts };
}

export function filteredRows(
  rows: readonly Row[],
  words: readonly string[],
): readonly Row[] {
  return words.length === 0
    ? rows
    : rows.filter(
        (row) => row.entry === undefined || matchesFilter(words, row.key),
      );
}

export interface ShownRows {
  readonly rows: readonly Row[];
  readonly files: number;
  readonly total: number;
  readonly starts?: ReadonlySet<string>;
}

const noRows: readonly Row[] = [];

const shownByRows = new WeakMap<
  readonly Row[],
  { readonly query: string; readonly shown: ShownRows }
>();

function filesIn(rows: readonly Row[]): number {
  return rows.reduce(
    (count, row) => (row.entry === undefined ? count : count + 1),
    0,
  );
}

function shownRowsIn(all: readonly Row[], query: string): ShownRows {
  const kept = shownByRows.get(all);
  if (kept?.query === query) {
    return kept.shown;
  }
  const rows = filteredRows(all, filterWords(query));
  const total = filesIn(all);
  const shown = { rows, files: rows === all ? total : filesIn(rows), total };
  shownByRows.set(all, { query, shown });
  return shown;
}

const flatShownByRows = new WeakMap<
  readonly Row[],
  { readonly all: readonly Row[]; readonly shown: ShownRows }
>();

function flatShownRows(
  all: readonly Row[],
  filtered: readonly Row[] | undefined,
): ShownRows {
  const rows = filtered ?? all;
  const kept = flatShownByRows.get(rows);
  if (kept?.all === all) {
    return kept.shown;
  }
  const total = filesIn(all);
  const shown = {
    rows,
    files: rows === all ? total : filesIn(rows),
    total,
  };
  flatShownByRows.set(rows, { all, shown });
  return shown;
}

const duplicatesShown = new WeakMap<
  ShownRows,
  { readonly groups: readonly (readonly string[])[]; readonly shown: ShownRows }
>();

function withDuplicates(
  all: ShownRows,
  groups: readonly (readonly string[])[],
): ShownRows {
  const kept = duplicatesShown.get(all);
  if (kept?.groups === groups) {
    return kept.shown;
  }
  const { rows, starts } = duplicateRows(all.rows, groups);
  const shown = { rows, files: filesIn(rows), total: all.total, starts };
  duplicatesShown.set(all, { groups, shown });
  return shown;
}

export function shownRowsOf(state: CommanderSource, side: Side): ShownRows {
  const pane = state.view.panes[side];
  const query = filterOf(state, side) ?? '';
  const all =
    pane?.flat === undefined
      ? shownRowsIn(pane?.rows ?? noRows, query)
      : flatShownRows(
          pane.rows,
          filterWords(query).length === 0 ? undefined : pane.flat.shown?.rows,
        );
  return pane?.duplicates === undefined
    ? all
    : withDuplicates(all, pane.duplicates.groups);
}
