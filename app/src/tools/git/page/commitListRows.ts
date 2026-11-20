import { type VirtualItem, type Virtualizer } from '@tanstack/react-virtual';
import { workingTreeHash } from '../shared/protocol';
import { CommitHistory } from './commitHistory';
import { measureInLines, useLineHeight } from '../../../lib/page/lineHeight';
import type { RefObject } from 'react';

const defaultRowLineHeight = 18;
export const commitRowHeight = 2 * defaultRowLineHeight;
export const workingTreeRowHeight = defaultRowLineHeight;
export const bubbleLineHeight = defaultRowLineHeight;

type BubbleRows = Pick<ReadonlyMap<number, readonly number[]>, 'get' | 'has'>;

const noBubbleRows: BubbleRows = new Map();

export function estimatedRowHeight(
  history: CommitHistory | undefined,
  offset: number,
  index: number,
  line = defaultRowLineHeight,
  bubbleRows: BubbleRows = noBubbleRows,
): number {
  if (index < offset) {
    return line;
  }
  const position = index - offset;
  const bubbleLines =
    (history?.isCrowded(position) === true
      ? bubbleRows.get(position)?.length
      : undefined) ?? (history?.hasBubbles(position) === true ? 1 : 0);
  return (2 + bubbleLines) * line;
}

export function rowSizes(
  history: CommitHistory | undefined,
  offset: number,
  line: number,
  ratio: number,
  bubbleRows: BubbleRows = noBubbleRows,
): {
  readonly estimateSize: (index: number) => number;
  readonly measureElement: ReturnType<typeof measureInLines>;
} {
  return {
    estimateSize: (index) =>
      estimatedRowHeight(history, offset, index, line, bubbleRows),
    measureElement: measureInLines(line, ratio),
  };
}

export function rowKeyOf(
  history: CommitHistory | undefined,
  offset: number,
  index: number,
): string | number {
  return index < offset
    ? workingTreeHash
    : (history?.keyAt(index - offset) ?? index);
}

function remeasureRowsLaidOutBeforeTheirCommitLoaded(
  rows: readonly VirtualItem[],
  heights: Virtualizer<Element, Element>['itemSizeCache'],
  keyOf: (index: number) => VirtualItem['key'],
): void {
  for (const row of rows) {
    const key = keyOf(row.index);
    if (row.key !== key) {
      heights.delete(key);
    }
  }
}

export function drawnRows(
  virtualizer: Pick<
    Virtualizer<Element, Element>,
    'getVirtualItems' | 'itemSizeCache'
  >,
  keyOf: (index: number) => VirtualItem['key'],
): VirtualItem[] {
  const rows = virtualizer.getVirtualItems();
  remeasureRowsLaidOutBeforeTheirCommitLoaded(
    rows,
    virtualizer.itemSizeCache,
    keyOf,
  );
  return rows.map((row) => {
    const key = keyOf(row.index);
    return key === row.key ? row : { ...row, key };
  });
}

export function fixedRowHeight(
  history: CommitHistory | undefined,
  offset: number,
  index: number,
  estimated: number,
  bubbleRows: BubbleRows = noBubbleRows,
): number | undefined {
  return index < offset ||
    (history?.at(index - offset) !== undefined &&
      !bubbleRows.has(index - offset))
    ? undefined
    : estimated;
}

export function useRowLineHeight(
  list: RefObject<Element | null>,
  ratio: number,
): number {
  return useLineHeight(list, defaultRowLineHeight, ratio);
}

export function crowdedResize(
  measured: readonly Pick<VirtualItem, 'end' | 'size'>[],
  positions: readonly number[],
  offset: number,
  estimateSize: (index: number) => number,
  top: number | undefined,
): { readonly resized: boolean; readonly above: number } {
  let resized = false;
  let above = 0;
  for (const position of positions) {
    const index = position + offset;
    const shown = measured[index];
    const size = estimateSize(index);
    if (shown !== undefined && shown.size !== size) {
      resized = true;
      if (top !== undefined && shown.end <= top) {
        above += size - shown.size;
      }
    }
  }
  return { resized, above };
}
