import type { Board } from '../shared/board';

export function typedTextOf(
  board: Board | undefined,
  id: string,
): string | undefined {
  const node = board?.nodes.find((each) => each.id === id);
  if (node?.type === 'group') {
    return node.label ?? '';
  }
  if (node !== undefined) {
    return node.type === 'text' ? node.text : undefined;
  }
  const edge = board?.edges.find((each) => each.id === id);
  return edge === undefined ? undefined : (edge.label ?? '');
}

export const typesOneLine = (
  board: Board | undefined,
  id: string | undefined,
): boolean =>
  id !== undefined &&
  (board?.nodes.find((each) => each.id === id)?.type === 'group' ||
    board?.edges.some((each) => each.id === id) === true);
