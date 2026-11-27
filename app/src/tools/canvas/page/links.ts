import type { BoardNode } from '../shared/board';
import { isWebLink, type NodeFile } from '../shared/protocol';

export type Opened = { readonly url: string } | { readonly path: string };

export function pastedLink(text: string): string | undefined {
  const trimmed = text.trim();
  return /\s/.test(trimmed) || !isWebLink(trimmed) ? undefined : trimmed;
}

export function openedOf(
  node: BoardNode | undefined,
  files: Readonly<Record<string, NodeFile>> | undefined,
): Opened | undefined {
  if (node?.type === 'link') {
    return { url: node.url };
  }
  const at = node?.type === 'file' ? files?.[node.file]?.path : undefined;
  return at === undefined ? undefined : { path: at };
}

export function openNode(
  opened: Opened,
  followPath: (path: string) => void,
): void {
  if ('url' in opened) {
    window.open(opened.url, '_blank', 'noopener');
  } else {
    followPath(opened.path);
  }
}
