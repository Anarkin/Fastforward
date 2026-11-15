import type { ContextMenuItem } from './contextMenuItem';
import { filterWords, matchesFilter } from '../shared/filter';

export function filteredItems(
  items: readonly ContextMenuItem[],
  query: string,
): readonly ContextMenuItem[] {
  const words = filterWords(query);
  if (words.length === 0) {
    return items;
  }
  return items.filter(
    (item) =>
      !('separator' in item) && matchesFilter(words, item.label, item.keywords),
  );
}
