import { sides, type Side } from '../shared/sides';
import type { CommanderSource, PaneFilter } from './commanderState';

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
