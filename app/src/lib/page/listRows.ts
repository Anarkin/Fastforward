import type { RowPlacement } from './pinnedRows';

export const estimatedRowHeight = 22;

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
