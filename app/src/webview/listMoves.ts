export interface VisibleRows {
  readonly first: number;
  readonly last: number;
}

export function fullyVisible(
  items: readonly { index: number; start: number; end: number }[],
  scrollTop: number,
  height: number,
  offset: number,
): VisibleRows {
  const first = items.find((item) => item.start >= scrollTop) ?? items.at(0);
  const last =
    items.findLast((item) => item.end <= scrollTop + height) ?? items.at(-1);
  return {
    first: (first?.index ?? 0) - offset,
    last: (last?.index ?? 0) - offset,
  };
}

const listKeys = new Set([
  'ArrowDown',
  'ArrowUp',
  'Home',
  'End',
  'PageDown',
  'PageUp',
]);

export function listKey(key: string): boolean {
  return listKeys.has(key);
}

export function moveInList(
  key: string,
  from: number | undefined,
  count: number,
  visible: VisibleRows,
): number | undefined {
  if (count === 0) {
    return undefined;
  }
  const page = Math.max(1, visible.last - visible.first);
  let target: number;
  switch (key) {
    case 'ArrowDown':
      target = from === undefined ? 0 : from + 1;
      break;
    case 'ArrowUp':
      target = from === undefined ? 0 : from - 1;
      break;
    case 'Home':
      target = 0;
      break;
    case 'End':
      target = count - 1;
      break;
    case 'PageDown':
      target =
        from === undefined || from < visible.last ? visible.last : from + page;
      break;
    case 'PageUp':
      target =
        from === undefined || from > visible.first
          ? visible.first
          : from - page;
      break;
    default:
      return undefined;
  }
  const index = Math.max(0, Math.min(count - 1, target));
  return index === from ? undefined : index;
}
