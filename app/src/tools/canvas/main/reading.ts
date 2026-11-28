import { withoutMark } from '../../../components/encodings/shared/byteOrderMarks';
import { isObject, type Json } from '../../../lib/main/json';
import {
  backgroundStyles,
  edgeEnds,
  nodeSides,
  type Board,
  type BoardEdge,
  type BoardNode,
  farthestPlace,
} from '../shared/board';

export type BoardRead =
  | { readonly kind: 'board'; readonly board: Board; readonly skipped: number }
  | { readonly kind: 'notJson' }
  | { readonly kind: 'notBoard' };

const emptyBoard: Board = { nodes: [], edges: [] };

function parsed(text: string): { readonly value: unknown } | undefined {
  try {
    return { value: JSON.parse(text) };
  } catch {
    return undefined;
  }
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isPlace = (value: unknown): value is number =>
  isNumber(value) && Math.abs(value) <= farthestPlace;

function oneOf<const T extends string>(
  choices: readonly T[],
  value: unknown,
): T | undefined {
  return choices.find((choice) => choice === value);
}

function placedOf(value: Json) {
  const { id, x, y, width, height, color } = value;
  return typeof id === 'string' &&
    isPlace(x) &&
    isPlace(y) &&
    isPlace(width) &&
    isPlace(height)
    ? { id, x, y, width, height, ...(typeof color === 'string' && { color }) }
    : undefined;
}

function nodeOf(value: unknown): BoardNode | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const placed = placedOf(value);
  if (placed === undefined) {
    return undefined;
  }
  const { text, file, subpath, url, label, background } = value;
  switch (value.type) {
    case 'text':
      return typeof text === 'string'
        ? { ...placed, type: 'text', text }
        : undefined;
    case 'file':
      return typeof file === 'string'
        ? {
            ...placed,
            type: 'file',
            file,
            ...(typeof subpath === 'string' && { subpath }),
          }
        : undefined;
    case 'link':
      return typeof url === 'string'
        ? { ...placed, type: 'link', url }
        : undefined;
    case 'group': {
      const backgroundStyle = oneOf(backgroundStyles, value.backgroundStyle);
      return {
        ...placed,
        type: 'group',
        ...(typeof label === 'string' && { label }),
        ...(typeof background === 'string' && { background }),
        ...(backgroundStyle !== undefined && { backgroundStyle }),
      };
    }
    default:
      return undefined;
  }
}

function edgeOf(
  value: unknown,
  nodes: ReadonlySet<string>,
): BoardEdge | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const { id, fromNode, toNode, color, label } = value;
  if (
    typeof id !== 'string' ||
    typeof fromNode !== 'string' ||
    typeof toNode !== 'string' ||
    !nodes.has(fromNode) ||
    !nodes.has(toNode)
  ) {
    return undefined;
  }
  const fromSide = oneOf(nodeSides, value.fromSide);
  const toSide = oneOf(nodeSides, value.toSide);
  const fromEnd = oneOf(edgeEnds, value.fromEnd);
  const toEnd = oneOf(edgeEnds, value.toEnd);
  return {
    id,
    fromNode,
    toNode,
    ...(fromSide !== undefined && { fromSide }),
    ...(fromEnd !== undefined && { fromEnd }),
    ...(toSide !== undefined && { toSide }),
    ...(toEnd !== undefined && { toEnd }),
    ...(typeof color === 'string' && { color }),
    ...(typeof label === 'string' && { label }),
  };
}

function listOf(value: unknown): readonly unknown[] | undefined {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : undefined;
}

function firstOfEachId<T extends { readonly id: string }>(
  items: readonly (T | undefined)[],
): T[] {
  const seen = new Set<string>();
  return items.filter(
    (item): item is T =>
      item !== undefined && !seen.has(item.id) && Boolean(seen.add(item.id)),
  );
}

export function boardOf(text: string): BoardRead {
  const json = withoutMark(text);
  if (json.trim() === '') {
    return { kind: 'board', board: emptyBoard, skipped: 0 };
  }
  const read = parsed(json);
  return read === undefined ? { kind: 'notJson' } : boardFrom(read.value);
}

export function boardFrom(value: unknown): BoardRead {
  if (!isObject(value)) {
    return { kind: 'notBoard' };
  }
  const listedNodes = listOf(value.nodes);
  const listedEdges = listOf(value.edges);
  if (listedNodes === undefined || listedEdges === undefined) {
    return { kind: 'notBoard' };
  }
  const nodes = firstOfEachId(listedNodes.map(nodeOf));
  const ids = new Set(nodes.map((node) => node.id));
  const edges = firstOfEachId(listedEdges.map((edge) => edgeOf(edge, ids)));
  return {
    kind: 'board',
    board: { nodes, edges },
    skipped:
      listedNodes.length + listedEdges.length - nodes.length - edges.length,
  };
}
