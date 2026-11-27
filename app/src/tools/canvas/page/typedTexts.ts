import type { Board } from '../shared/board';

export function typedTextOf(
  board: Board | undefined,
  id: string,
): string | undefined {
  const node = board?.nodes.find((each) => each.id === id);
  if (node?.type === 'group') {
    return node.label ?? '';
  }
  if (node?.type === 'file') {
    return node.file + (node.subpath ?? '');
  }
  if (node?.type === 'link') {
    return node.url;
  }
  if (node !== undefined) {
    return node.type === 'text' ? node.text : undefined;
  }
  const edge = board?.edges.find((each) => each.id === id);
  return edge === undefined ? undefined : (edge.label ?? '');
}

const oneLineKinds: ReadonlySet<string> = new Set(['group', 'file', 'link']);

export const typesOneLine = (
  board: Board | undefined,
  id: string | undefined,
): boolean =>
  id !== undefined &&
  (oneLineKinds.has(board?.nodes.find((each) => each.id === id)?.type ?? '') ||
    board?.edges.some((each) => each.id === id) === true);
