import * as path from 'node:path';
import { isObject } from '../../../lib/main/json';
import { edgeEnds, nodeSides, whichEnds } from '../shared/board';
import {
  addedKinds,
  isBoardColor,
  nodeOrders,
  type BoardEdit,
  type CanvasDrop,
  type PlacedBox,
} from '../shared/protocol';

const mostItems = 100_000;

const mostId = 256;

const farthest = 1_000_000_000;

const longestText = 50_000_000;

const longestUrl = 8192;

const isId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= mostId;

const isPlace = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  Math.abs(value) <= farthest;

const isSize = (value: unknown): value is number =>
  isPlace(value) && value >= 1;

function boxOf(value: unknown): PlacedBox | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const { x, y, width, height } = value;
  return isPlace(x) && isPlace(y) && isSize(width) && isSize(height)
    ? { x, y, width, height }
    : undefined;
}

function idsOf(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.length <= mostItems && value.every(isId)
    ? value
    : undefined;
}

export function dropOf(
  files: unknown,
  message: unknown,
): (CanvasDrop & { readonly files: readonly string[] }) | undefined {
  if (
    !isObject(message) ||
    !isId(message.tab) ||
    !Array.isArray(files) ||
    files.length > mostItems ||
    !files.every(
      (file): file is string =>
        typeof file === 'string' && path.isAbsolute(file),
    )
  ) {
    return undefined;
  }
  const box = boxOf(message.box);
  return box === undefined ? undefined : { tab: message.tab, box, files };
}

export function editOf(value: unknown): BoardEdit | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  switch (value.kind) {
    case 'place': {
      const { boxes } = value;
      if (!Array.isArray(boxes) || boxes.length > mostItems) {
        return undefined;
      }
      const placed = boxes.flatMap((each: unknown) => {
        const box = boxOf(each);
        return box !== undefined && isObject(each) && isId(each.id)
          ? [{ id: each.id, ...box }]
          : [];
      });
      return placed.length === boxes.length
        ? { kind: 'place', boxes: placed }
        : undefined;
    }
    case 'add': {
      const { node } = value;
      const box = boxOf(node);
      const type = isObject(node)
        ? addedKinds.find((kind) => kind === node.type)
        : undefined;
      return box === undefined || type === undefined
        ? undefined
        : { kind: 'add', node: { type, ...box } };
    }
    case 'connect': {
      const { fromNode, toNode } = value;
      const fromSide = nodeSides.find((side) => side === value.fromSide);
      const toSide = nodeSides.find((side) => side === value.toSide);
      return isId(fromNode) &&
        isId(toNode) &&
        fromSide !== undefined &&
        toSide !== undefined
        ? { kind: 'connect', fromNode, fromSide, toNode, toSide }
        : undefined;
    }
    case 'link': {
      const { url } = value;
      const box = boxOf(value.box);
      return typeof url === 'string' &&
        url.length <= longestUrl &&
        box !== undefined
        ? { kind: 'link', url, box }
        : undefined;
    }
    case 'reroute': {
      const { edge, node } = value;
      const end = whichEnds.find((each) => each === value.end);
      const side = nodeSides.find((each) => each === value.side);
      return isId(edge) && isId(node) && end !== undefined && side !== undefined
        ? { kind: 'reroute', edge, end, node, side }
        : undefined;
    }
    case 'ends': {
      const edges = idsOf(value.edges);
      const fromEnd = edgeEnds.find((end) => end === value.fromEnd);
      const toEnd = edgeEnds.find((end) => end === value.toEnd);
      return edges === undefined || fromEnd === undefined || toEnd === undefined
        ? undefined
        : { kind: 'ends', edges, fromEnd, toEnd };
    }
    case 'text': {
      const { id, text, session } = value;
      return isId(id) &&
        typeof text === 'string' &&
        text.length <= longestText &&
        typeof session === 'number' &&
        Number.isSafeInteger(session)
        ? { kind: 'text', id, text, session }
        : undefined;
    }
    case 'delete': {
      const nodes = idsOf(value.nodes);
      const edges = idsOf(value.edges);
      return nodes === undefined || edges === undefined
        ? undefined
        : { kind: 'delete', nodes, edges };
    }
    case 'color': {
      const nodes = idsOf(value.nodes);
      const edges = idsOf(value.edges);
      const { color } = value;
      if (nodes === undefined || edges === undefined) {
        return undefined;
      }
      if (color === undefined) {
        return { kind: 'color', nodes, edges };
      }
      return typeof color === 'string' && isBoardColor(color)
        ? { kind: 'color', nodes, edges, color }
        : undefined;
    }
    case 'order': {
      const nodes = idsOf(value.nodes);
      const to = nodeOrders.find((order) => order === value.to);
      return nodes === undefined || to === undefined
        ? undefined
        : { kind: 'order', nodes, to };
    }
    default:
      return undefined;
  }
}
