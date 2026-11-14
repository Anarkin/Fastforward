import { filterWords } from '../../../lib/page/fileFilter';
import { sides, type Side } from '../shared/protocol';
import type { ColumnWidths } from '../shared/settings';
import type { CommanderSource, PaneFilter } from './commanderState';
import { duplicateRows, filteredRows, type Row } from './listing';
import type { CommanderView, PaneView } from './view';

export function shownColumns({ view, resized }: CommanderSource): ColumnWidths {
  return resized !== undefined && resized.from === view.columns
    ? resized.widths
    : view.columns;
}

export function filterKey(tab: string, side: Side): string {
  return JSON.stringify([tab, side]);
}

export function filterOf(
  { view, filters }: CommanderSource,
  side: Side,
): string | undefined {
  const filter =
    view.tab === undefined ? undefined : filters.get(filterKey(view.tab, side));
  return filter !== undefined && filter.folder === view.panes[side]?.folder
    ? filter.query
    : undefined;
}

export function seenFilters({
  view,
  filters,
}: CommanderSource): ReadonlyMap<string, PaneFilter> {
  const { tab, panes } = view;
  if (tab === undefined) {
    return filters;
  }
  const left = sides
    .map((side) => filterKey(tab, side))
    .filter((key, index) => {
      const filter = filters.get(key);
      const folder = panes[sides[index]]?.folder;
      return (
        filter !== undefined && folder !== undefined && filter.folder !== folder
      );
    });
  if (left.length === 0) {
    return filters;
  }
  const kept = new Map(filters);
  for (const key of left) {
    kept.delete(key);
  }
  return kept;
}

export function withoutTab(
  filters: ReadonlyMap<string, PaneFilter>,
  tab: string,
): ReadonlyMap<string, PaneFilter> {
  const keys = sides.map((side) => filterKey(tab, side));
  if (!keys.some((key) => filters.has(key))) {
    return filters;
  }
  const kept = new Map(filters);
  for (const key of keys) {
    kept.delete(key);
  }
  return kept;
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

export function flatPanesOf({ tab, panes, kept }: CommanderView): Set<string> {
  const flat = new Set<string>();
  const add = (
    each: string | undefined,
    sidesOf: Readonly<Record<Side, PaneView | undefined>>,
  ) => {
    for (const side of sides) {
      if (each !== undefined && sidesOf[side]?.flat !== undefined) {
        flat.add(filterKey(each, side));
      }
    }
  };
  add(tab, panes);
  for (const [each, away] of kept) {
    if (each !== tab) {
      add(each, away.panes);
    }
  }
  return flat;
}
