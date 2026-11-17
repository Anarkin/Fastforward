import {
  narrows,
  matchesFilter,
  searchFilter,
  type Filter,
} from '../../../lib/shared/filter';
import {
  noSearch,
  sameSearchOptions,
  type Search,
} from '../../../lib/shared/searchOptions';
import type { Side } from '../shared/sides';
import type { ColumnWidths } from '../shared/columnWidths';
import type { CommanderSource } from './state';
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
  filter: Filter,
): readonly Row[] {
  return narrows(filter)
    ? rows.filter(
        (row) => row.entry === undefined || matchesFilter(filter, row.key),
      )
    : rows;
}

export interface ShownRows {
  readonly rows: readonly Row[];
  readonly starts?: ReadonlySet<string>;
}

const noRows: readonly Row[] = [];

const shownByRows = new WeakMap<
  readonly Row[],
  { readonly search: Search; readonly shown: ShownRows }
>();

function shownRowsIn(all: readonly Row[], search: Search): ShownRows {
  const kept = shownByRows.get(all);
  if (
    kept !== undefined &&
    kept.search.query === search.query &&
    sameSearchOptions(kept.search.options, search.options)
  ) {
    return kept.shown;
  }
  const rows = filteredRows(all, searchFilter(search.query, search.options));
  const shown = { rows };
  shownByRows.set(all, { search, shown });
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
  const shown = { rows };
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
  const shown = { rows, starts };
  duplicatesShown.set(all, { groups, shown });
  return shown;
}

export function shownRowsOf(state: CommanderSource, side: Side): ShownRows {
  const pane = state.view.panes[side];
  const search = filterOf(state, side) ?? noSearch;
  const all =
    pane?.flat === undefined
      ? shownRowsIn(pane?.rows ?? noRows, search)
      : flatShownRows(
          pane.rows,
          narrows(searchFilter(search.query, search.options))
            ? pane.flat.shown?.rows
            : undefined,
        );
  return pane?.duplicates === undefined
    ? all
    : withDuplicates(all, pane.duplicates.groups);
}
