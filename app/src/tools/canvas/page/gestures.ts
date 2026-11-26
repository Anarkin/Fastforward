import type { Board } from '../shared/board';
import type { BoardEdit } from '../shared/protocol';
import type { Box, Unit } from './grid';
import { areaBetween, touched, type Hit, type Sides } from './hits';
import { boxesOf, fileBox, movedBy, resizedBy } from './placing';
import type { Cell } from './routes';

export type Gesture =
  | {
      readonly kind: 'move';
      readonly from: Cell;
      readonly boxes: ReadonlyMap<string, Box>;
    }
  | {
      readonly kind: 'resize';
      readonly from: Cell;
      readonly id: string;
      readonly box: Box;
      readonly sides: Sides;
    }
  | {
      readonly kind: 'area';
      readonly from: Cell;
      readonly kept: readonly string[];
    };

export type Way = 'one' | 'toggle' | 'add';

export interface Preview {
  readonly boxes: ReadonlyMap<string, Box>;
  readonly area?: Box;
}

const noBoxes: ReadonlyMap<string, Box> = new Map();

export function pressed(
  board: Board,
  unit: Unit,
  hit: Hit,
  at: Cell,
  selected: readonly string[],
  way: Way,
): { readonly selected: readonly string[]; readonly gesture?: Gesture } {
  switch (hit.kind) {
    case 'handle': {
      const box = boxesOf(board, unit, new Set([hit.id])).get(hit.id);
      return box === undefined
        ? { selected }
        : {
            selected,
            gesture: {
              kind: 'resize',
              from: at,
              id: hit.id,
              box,
              sides: hit.sides,
            },
          };
    }
    case 'node': {
      if (way === 'toggle') {
        return {
          selected: selected.includes(hit.id)
            ? selected.filter((id) => id !== hit.id)
            : [...selected, hit.id],
        };
      }
      const chosen =
        way === 'add'
          ? selected.includes(hit.id)
            ? selected
            : [...selected, hit.id]
          : selected.includes(hit.id)
            ? selected
            : [hit.id];
      return {
        selected: chosen,
        gesture: {
          kind: 'move',
          from: at,
          boxes: boxesOf(board, unit, new Set(chosen)),
        },
      };
    }
    case 'empty': {
      const kept = way === 'one' ? [] : selected;
      return { selected: kept, gesture: { kind: 'area', from: at, kept } };
    }
    default:
      return hit satisfies never;
  }
}

function boxesAt(gesture: Gesture, at: Cell): ReadonlyMap<string, Box> {
  const columns = at.column - gesture.from.column;
  const rows = at.row - gesture.from.row;
  switch (gesture.kind) {
    case 'move':
      return new Map(
        [...gesture.boxes].map(([id, box]) => [
          id,
          movedBy(box, columns, rows),
        ]),
      );
    case 'resize':
      return new Map([
        [gesture.id, resizedBy(gesture.box, gesture.sides, columns, rows)],
      ]);
    case 'area':
      return noBoxes;
    default:
      return gesture satisfies never;
  }
}

export function dragging(
  gesture: Gesture,
  board: Board,
  unit: Unit,
  at: Cell,
): { readonly preview: Preview; readonly selected?: readonly string[] } {
  if (gesture.kind !== 'area') {
    return { preview: { boxes: boxesAt(gesture, at) } };
  }
  const area = areaBetween(gesture.from, at);
  const taken = touched(board, unit, area);
  return {
    preview: { boxes: noBoxes, area },
    selected: [...new Set([...gesture.kept, ...taken])],
  };
}

export function released(
  gesture: Gesture,
  unit: Unit,
  at: Cell,
): BoardEdit | undefined {
  if (
    gesture.kind === 'area' ||
    (at.column === gesture.from.column && at.row === gesture.from.row)
  ) {
    return undefined;
  }
  const boxes = [...boxesAt(gesture, at)].map(([id, box]) =>
    fileBox(id, box, unit),
  );
  return boxes.length === 0 ? undefined : { kind: 'place', boxes };
}
