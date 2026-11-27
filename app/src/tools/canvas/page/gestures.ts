import type { Board, NodeSide, WhichEnd } from '../shared/board';
import type { BoardEdit } from '../shared/protocol';
import { boxOf, type Box, type Unit } from './grid';
import { areaBetween, holds, touched, type Hit, type Sides } from './hits';
import { boxesOf, fileBox, movedBy, resizedBy } from './placing';
import type { Cell } from './routes';
import { hoveredAt, nearestSide } from './wiring';

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
    }
  | {
      readonly kind: 'connect';
      readonly from: Cell;
      readonly id: string;
      readonly side: NodeSide;
    }
  | {
      readonly kind: 'reroute';
      readonly from: Cell;
      readonly id: string;
      readonly end: WhichEnd;
    };

export interface Wire {
  readonly fromNode: string;
  readonly fromSide: NodeSide;
  readonly to:
    { readonly node: string; readonly side: NodeSide } | { readonly at: Cell };
}

export interface Rerouted {
  readonly id: string;
  readonly end: WhichEnd;
  readonly to: Wire['to'];
}

export type Way = 'one' | 'toggle' | 'add';

export interface Preview {
  readonly boxes: ReadonlyMap<string, Box>;
  readonly area?: Box;
  readonly wire?: Wire;
  readonly reroute?: Rerouted;
}

const noBoxes: ReadonlyMap<string, Box> = new Map();

function carried(
  board: Board,
  unit: Unit,
  chosen: readonly string[],
): ReadonlyMap<string, Box> {
  const ids = new Set(chosen);
  const groups = board.nodes.flatMap((node) =>
    node.type === 'group' && ids.has(node.id) ? [boxOf(node, unit)] : [],
  );
  for (const node of board.nodes) {
    const box = boxOf(node, unit);
    if (groups.some((group) => holds(group, box))) {
      ids.add(node.id);
    }
  }
  return boxesOf(board, unit, ids);
}

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
    case 'mark':
      return {
        selected,
        gesture: { kind: 'connect', from: at, id: hit.id, side: hit.side },
      };
    case 'end':
      return {
        selected,
        gesture: { kind: 'reroute', from: at, id: hit.id, end: hit.end },
      };
    case 'edge':
      return { selected: chosenWith(selected, hit.id, way) };
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
          boxes: carried(board, unit, chosen),
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

function chosenWith(
  selected: readonly string[],
  id: string,
  way: Way,
): readonly string[] {
  if (way === 'one') {
    return [id];
  }
  if (selected.includes(id)) {
    return way === 'toggle' ? selected.filter((each) => each !== id) : selected;
  }
  return [...selected, id];
}

function wireTo(
  gesture: Extract<Gesture, { readonly kind: 'connect' }>,
  board: Board,
  unit: Unit,
  at: Cell,
): Wire {
  const target = hoveredAt(board, unit, at);
  return {
    fromNode: gesture.id,
    fromSide: gesture.side,
    to:
      target === undefined || target.id === gesture.id
        ? { at }
        : { node: target.id, side: nearestSide(target.box, at, unit) },
  };
}

function rerouteTo(
  gesture: Extract<Gesture, { readonly kind: 'reroute' }>,
  board: Board,
  unit: Unit,
  at: Cell,
): Rerouted {
  const edge = board.edges.find((each) => each.id === gesture.id);
  const other = gesture.end === 'from' ? edge?.toNode : edge?.fromNode;
  const target = hoveredAt(board, unit, at);
  return {
    id: gesture.id,
    end: gesture.end,
    to:
      target === undefined || target.id === other
        ? { at }
        : { node: target.id, side: nearestSide(target.box, at, unit) },
  };
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
    case 'connect':
    case 'reroute':
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
  if (gesture.kind === 'connect') {
    return {
      preview: { boxes: noBoxes, wire: wireTo(gesture, board, unit, at) },
    };
  }
  if (gesture.kind === 'reroute') {
    return {
      preview: { boxes: noBoxes, reroute: rerouteTo(gesture, board, unit, at) },
    };
  }
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
  board: Board,
  unit: Unit,
  at: Cell,
): BoardEdit | undefined {
  if (gesture.kind === 'reroute') {
    const { id, end, to } = rerouteTo(gesture, board, unit, at);
    return 'node' in to
      ? { kind: 'reroute', edge: id, end, node: to.node, side: to.side }
      : undefined;
  }
  if (gesture.kind === 'connect') {
    const { fromNode, fromSide, to } = wireTo(gesture, board, unit, at);
    return 'node' in to
      ? {
          kind: 'connect',
          fromNode,
          fromSide,
          toNode: to.node,
          toSide: to.side,
        }
      : undefined;
  }
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
