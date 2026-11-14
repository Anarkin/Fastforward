export const estimatedRowHeight = 22;

const loneSurrogate =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function encodedKey(key: string): string {
  if (key.isWellFormed()) {
    return encodeURIComponent(key);
  }
  let encoded = '';
  let from = 0;
  for (const lone of key.matchAll(loneSurrogate)) {
    encoded += `${encodeURIComponent(key.slice(from, lone.index))}%u${lone[0].charCodeAt(0).toString(16)}`;
    from = lone.index + 1;
  }
  return `${encoded}${encodeURIComponent(key.slice(from))}`;
}

export const rowId = (list: string, key: React.Key) =>
  `${list}${encodedKey(String(key))}`;

export function activeDescendant(
  list: string,
  key: React.Key | undefined,
  drawn: readonly { readonly key: React.Key }[],
): string | undefined {
  return key !== undefined && drawn.some((row) => row.key === key)
    ? rowId(list, key)
    : undefined;
}

export interface TreeItem {
  readonly level: number;
  readonly expanded?: boolean;
}

export interface ListedRows {
  readonly count: number;
  readonly keyOf: (index: number) => string;
  readonly indexOf: (key: string) => number;
}

export function scrollTarget(
  selectedKey: string | undefined,
  keys: { indexOf(key: string): number },
): string | undefined {
  return selectedKey !== undefined && keys.indexOf(selectedKey) !== -1
    ? selectedKey
    : undefined;
}

export interface Reveal {
  readonly key: string | undefined;
  readonly rows: readonly unknown[];
}

export function revealAgain(before: Reveal | undefined, now: Reveal): boolean {
  return (
    now.key !== undefined &&
    (before?.key !== now.key ||
      before.rows.length !== now.rows.length ||
      now.rows.some((value, index) => value !== before.rows[index]))
  );
}

export interface RowPlacement {
  readonly start: number;
  readonly end: number;
}

function firstEndingAfter(
  placements: readonly RowPlacement[],
  offset: number,
): number {
  let low = 0;
  let high = placements.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (placements[middle].end > offset) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return low === placements.length ? -1 : low;
}

export function pinnedRows(
  placements: readonly RowPlacement[],
  scrollTop: number,
  ancestorsOf: (index: number) => readonly number[],
): readonly number[] {
  let pinned: readonly number[] = [];
  for (;;) {
    const covered =
      scrollTop +
      pinned.reduce(
        (sum, index) => sum + placements[index].end - placements[index].start,
        0,
      );
    const top = firstEndingAfter(placements, covered);
    if (top === -1) {
      return pinned;
    }
    const ancestors = ancestorsOf(top);
    const outside = pinned.findIndex((row, depth) => ancestors[depth] !== row);
    if (outside !== -1) {
      return pinned.slice(0, outside);
    }
    const next = ancestors.at(pinned.length);
    if (next === undefined || placements[next].start >= covered) {
      return pinned;
    }
    pinned = [...pinned, next];
  }
}

export function revealOffset(
  row: RowPlacement,
  scrollTop: number,
  height: number,
  covered: number,
): number | undefined {
  if (row.start < scrollTop + covered) {
    return Math.max(0, row.start - covered);
  }
  if (row.end > scrollTop + height) {
    return row.end - height;
  }
  return undefined;
}

export function endCovered(element: Element | null): number {
  const style =
    element === null
      ? undefined
      : element.ownerDocument.defaultView?.getComputedStyle(element);
  return parseFloat(style?.paddingBottom ?? '') || 0;
}
