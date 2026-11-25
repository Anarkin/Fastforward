import type { ContextMenuItem } from './contextMenuItem';
import { matchesFilter, narrows, type Filter } from '../shared/filter';

export function filteredItems(
  items: readonly ContextMenuItem[],
  filter: Filter,
): readonly ContextMenuItem[] {
  if (!narrows(filter)) {
    return items;
  }
  return items.filter(
    (item) =>
      !('separator' in item) &&
      matchesFilter(filter, item.label, item.keywords, ...(item.details ?? [])),
  );
}

export function leavesOf(
  items: readonly ContextMenuItem[],
): readonly ContextMenuItem[] {
  return items.flatMap((item) =>
    'separator' in item
      ? []
      : item.submenu === undefined
        ? [{ ...item, label: item.keywords ?? item.label }]
        : leavesOf(item.submenu),
  );
}
