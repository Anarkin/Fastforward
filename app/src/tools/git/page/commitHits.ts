import type { ActionKey, BubbleLook } from './bubbleLooks';

export interface ShownBubble {
  readonly look: BubbleLook;
  readonly checkedOut: boolean;
  readonly running: readonly ActionKey[];
}

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface ActionHit extends Box {
  readonly key: ActionKey;
}

export interface BubbleHit extends Box {
  readonly bubble: ShownBubble;
  readonly cut: boolean;
  readonly actions: readonly ActionHit[];
}

export interface RowHit {
  readonly index: number;
  readonly top: number;
  readonly height: number;
  readonly subjectLeft: number;
  readonly subjectWidth: number;
  readonly bubbles: readonly BubbleHit[];
  readonly merge: Box | undefined;
}

export type Hit =
  | { readonly kind: 'row'; readonly row: RowHit }
  | { readonly kind: 'merge'; readonly row: RowHit; readonly box: Box }
  | {
      readonly kind: 'bubble';
      readonly row: RowHit;
      readonly bubble: BubbleHit;
    }
  | {
      readonly kind: 'action';
      readonly row: RowHit;
      readonly bubble: BubbleHit;
      readonly action: ActionHit;
    };

function inside(box: Box, x: number, y: number): boolean {
  return (
    x >= box.left &&
    x < box.left + box.width &&
    y >= box.top &&
    y < box.top + box.height
  );
}

export function rowAt(rows: readonly RowHit[], y: number): RowHit | undefined {
  return rows.find((row) => y >= row.top && y < row.top + row.height);
}

export function hitAt(
  rows: readonly RowHit[],
  x: number,
  y: number,
): Hit | undefined {
  const row = rowAt(rows, y);
  if (row === undefined) {
    return undefined;
  }
  if (row.merge !== undefined && inside(row.merge, x, y)) {
    return { kind: 'merge', row, box: row.merge };
  }
  for (const bubble of row.bubbles) {
    if (inside(bubble, x, y)) {
      const action = bubble.actions.find((each) => inside(each, x, y));
      return action === undefined
        ? { kind: 'bubble', row, bubble }
        : { kind: 'action', row, bubble, action };
    }
  }
  return { kind: 'row', row };
}

export type Clicked =
  | { readonly kind: 'select' | 'compare' | 'merge'; readonly hash: string }
  | { readonly kind: 'action'; readonly hit: Extract<Hit, { kind: 'action' }> };

export function clickOf(
  hit: Hit | undefined,
  hash: string | undefined,
  compare: boolean,
): Clicked | undefined {
  if (hit === undefined) {
    return undefined;
  }
  if (hit.kind === 'action') {
    return { kind: 'action', hit };
  }
  if (hash === undefined) {
    return undefined;
  }
  return {
    kind: hit.kind === 'merge' ? 'merge' : compare ? 'compare' : 'select',
    hash,
  };
}

export function hitKey(hit: Hit | undefined): string | undefined {
  if (hit === undefined || hit.kind === 'row') {
    return undefined;
  }
  if (hit.kind === 'merge') {
    return `${hit.row.index}:merge`;
  }
  const at = hit.row.bubbles.indexOf(hit.bubble);
  return hit.kind === 'action'
    ? `${hit.row.index}:${at}:${hit.action.key}`
    : `${hit.row.index}:${at}`;
}

export interface SeenCommit {
  readonly index: number;
  readonly kind: 'commit' | 'workingTree' | 'placeholder' | undefined;
  readonly subject: string | undefined;
  readonly author: string | undefined;
  readonly date: string | undefined;
  readonly selected: boolean;
  readonly compareFrom: boolean;
  readonly checkedOut: boolean;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly subjectLeft: number;
  readonly line: number;
  readonly bubbles: readonly {
    readonly text: string;
    readonly kind: string;
    readonly checkedOut: boolean;
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
    readonly actions: readonly {
      readonly key: string;
      readonly left: number;
      readonly top: number;
      readonly width: number;
      readonly height: number;
    }[];
  }[];
}
