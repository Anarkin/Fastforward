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
      matchesFilter(filter, item.label, item.keywords),
  );
}
