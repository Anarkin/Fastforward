import { shownSide } from '../shared/comparisons';
import { workingTreeHash, workingTreeIndex } from '../shared/protocol';
import { CommitHistory } from './commitHistory';
import { commitMenuTarget, type MenuTarget } from './menus';
import {
  listMoveOf,
  moveInList,
  type ListMove,
  type VisibleRows,
} from '../../../lib/page/listMoves';
import { gitKeymap } from './keymap';
import { keyPressed } from '../../../lib/page/shortcuts';

export function commitMoveOf(
  event: Parameters<typeof listMoveOf>[0],
): ListMove | undefined {
  return listMoveOf(event) ?? keyPressed(gitKeymap.peekStep, event);
}

export function keySelection(
  history: CommitHistory,
  position: number,
  selected: string | undefined,
): string | null | undefined {
  const hash =
    position === workingTreeIndex
      ? workingTreeHash
      : history.at(position)?.hash;
  if (hash === undefined) {
    return null;
  }
  return hash === selected ? undefined : hash;
}

export function mergeToToggle(
  history: CommitHistory,
  selected: string | undefined,
): string | undefined {
  const position =
    selected === undefined ? undefined : history.positionOf(selected);
  return position !== undefined && history.graphAt(position)?.merge
    ? selected
    : undefined;
}

export function keyboardMenuTarget(
  selected: string | undefined,
  stashes: ReadonlySet<string>,
): MenuTarget | undefined {
  const hash = shownSide(selected);
  return hash === undefined || hash === workingTreeHash || stashes.has(hash)
    ? undefined
    : commitMenuTarget(hash);
}

export interface PendingKey {
  readonly history: CommitHistory;
  readonly position: number;
  readonly repeat: boolean;
}

export function pendingSelection(
  pending: PendingKey | undefined,
  history: CommitHistory | undefined,
  selected: string | undefined,
): { readonly hash: string; readonly repeat: boolean } | null | undefined {
  if (!pending || pending.history !== history) {
    return null;
  }
  const hash = keySelection(history, pending.position, selected);
  return hash === null || hash === undefined
    ? hash
    : { hash, repeat: pending.repeat };
}

function startPosition(
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

export function listKeyPosition(
  move: ListMove,
  history: CommitHistory,
  selected: string | undefined,
  workingTree: boolean,
  visible: VisibleRows,
  headCommit?: string,
  pending?: number,
): number | undefined {
  const from = pending ?? startPosition(history, selected);
  if (from === null) {
    return undefined;
  }
  const head =
    headCommit === undefined ? undefined : history.positionOf(headCommit);
  if (
    from === undefined &&
    head !== undefined &&
    (move === 'down' || move === 'up')
  ) {
    return head;
  }
  const top = workingTree ? workingTreeIndex : 0;
  const moved = moveInList(
    move,
    from === undefined ? undefined : from - top,
    history.total - top,
    { first: visible.first - top, last: visible.last - top },
  );
  return moved === undefined ? undefined : moved + top;
}
