export function replacedIn<T>(
  all: readonly T[],
  from: number,
  removed: number,
  items: readonly T[],
): T[] {
  return all.slice(0, from).concat(items, all.slice(from + removed));
}
