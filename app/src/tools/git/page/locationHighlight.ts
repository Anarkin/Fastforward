import { ResultItem, itemKey } from './locationResults';

export interface Highlighted {
  readonly query: string;
  readonly key: string;
}

export function currentActive(
  items: readonly ResultItem[],
  query: string,
  highlight: Highlighted | undefined,
): number {
  if (highlight?.query === query) {
    const index = items.findIndex((item) => itemKey(item) === highlight.key);
    if (index >= 0) {
      return index;
    }
  }
  return 0;
}

export function nextActive(
  items: readonly unknown[],
  active: number,
  step: 1 | -1,
): number {
  return Math.max(0, Math.min(items.length - 1, active + step));
}
