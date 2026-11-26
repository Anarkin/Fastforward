import { isObject } from '../../../lib/main/json';
import { addedKinds, type BoardEdit, type NodeBox } from '../shared/protocol';

const mostItems = 100_000;

const mostId = 256;

const farthest = 1_000_000_000;

const longestText = 50_000_000;

const isId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= mostId;

const isPlace = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  Math.abs(value) <= farthest;

const isSize = (value: unknown): value is number =>
  isPlace(value) && value >= 1;

function boxOf(value: unknown): Omit<NodeBox, 'id'> | undefined {
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
    default:
      return undefined;
  }
}
