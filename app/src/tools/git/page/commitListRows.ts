import { type VirtualItem, type Virtualizer } from '@tanstack/react-virtual';
import { shownSide } from '../shared/comparisons';
import { workingTreeHash, workingTreeIndex } from '../shared/protocol';
import { CommitHistory } from './commitHistory';
import { measureInLines, useLineHeight } from './lineHeight';
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

export function listTop(
  rows: readonly { index: number; start: number; end: number }[],
  scrollTop: number,
  history: CommitHistory | undefined,
  offset: number,
): { hash: string; offset: number } | undefined {
  if (scrollTop === 0) {
    return { hash: workingTreeHash, offset: 0 };
  }
  const row = rows.find((r) => r.end > scrollTop);
  if (!row) {
    return undefined;
  }
  if (row.index < offset) {
    return { hash: workingTreeHash, offset: scrollTop - row.start };
  }
  const commit = history?.at(row.index - offset);
  return commit && { hash: commit.hash, offset: scrollTop - row.start };
}

export function startPosition(
  history: CommitHistory,
  selection: string | undefined,
): number | null | undefined {
  const selected = shownSide(selection);
  if (selected === workingTreeHash) {
    return workingTreeIndex;
  }
  if (selected === undefined) {
    return undefined;
  }
  const hint = history.selectedIndex;
  return (
    history.positionOf(selected) ??
    (hint !== undefined && history.at(hint) === undefined
      ? hint
      : (history.keysFrom ?? null))
  );
}

export function useRowLineHeight(
  list: RefObject<Element | null>,
  ratio: number,
): number {
  return useLineHeight(list, defaultRowLineHeight, ratio);
}
