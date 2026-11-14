import { type ContextMenuItem } from './menuControls';

export function filteredItems(
  items: readonly ContextMenuItem[],
  query: string,
): readonly ContextMenuItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return items;
  }
  return items.filter((item) => {
    if ('separator' in item) {
      return false;
    }
    const text = `${item.label} ${item.keywords ?? ''}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
