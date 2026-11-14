import { keymap } from '../shared/keymap';
import { keyPressed } from './shortcuts';

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

export type ListMove = 'up' | 'down' | 'pageUp' | 'pageDown' | 'first' | 'last';

export function listMoveOf(
  event: Parameters<typeof keyPressed>[1],
): ListMove | undefined {
  return keyPressed(keymap.move, event) ?? keyPressed(keymap.page, event);
}

export function moveInList(
  move: ListMove,
  from: number | undefined,
  count: number,
  visible: VisibleRows,
): number | undefined {
  if (count === 0) {
    return undefined;
  }
  const page = Math.max(1, visible.last - visible.first);
  let target: number;
  switch (move) {
    case 'down':
      target = from === undefined ? 0 : from + 1;
      break;
    case 'up':
      target = from === undefined ? 0 : from - 1;
      break;
    case 'first':
      target = 0;
      break;
    case 'last':
      target = count - 1;
      break;
    case 'pageDown':
      target =
        from === undefined || from < visible.last ? visible.last : from + page;
      break;
    case 'pageUp':
      target =
        from === undefined || from > visible.first
          ? visible.first
          : from - page;
      break;
  }
  const index = Math.max(0, Math.min(count - 1, target));
  return index === from ? undefined : index;
}
