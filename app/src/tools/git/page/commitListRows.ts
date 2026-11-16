import { type VirtualItem, type Virtualizer } from '@tanstack/react-virtual';
import { workingTreeHash } from '../shared/protocol';
import { CommitHistory } from './commitHistory';
import { measureInLines, useLineHeight } from '../../../lib/page/lineHeight';
import type { RefObject } from 'react';

const defaultRowLineHeight = 18;
export const commitRowHeight = 2 * defaultRowLineHeight;
export const workingTreeRowHeight = defaultRowLineHeight;
export const bubbleLineHeight = defaultRowLineHeight;

export function estimatedRowHeight(
  history: CommitHistory | undefined,
  offset: number,
  index: number,
  line = defaultRowLineHeight,
): number {
  if (index < offset) {
    return line;
  }
  const lines = history?.hasBubbles(index - offset) ? 3 : 2;
  return lines * line;
}

export function rowSizes(
  history: CommitHistory | undefined,
  offset: number,
  line: number,
  ratio: number,
): {
  readonly estimateSize: (index: number) => number;
  readonly measureElement: ReturnType<typeof measureInLines>;
} {
  return {
    estimateSize: (index) => estimatedRowHeight(history, offset, index, line),
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
    : (history?.at(index - offset)?.hash ?? index);
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
): number | undefined {
  return index < offset || history?.at(index - offset) !== undefined
    ? undefined
    : estimated;
}

export function useRowLineHeight(
  list: RefObject<Element | null>,
  ratio: number,
): number {
  return useLineHeight(list, defaultRowLineHeight, ratio);
}
