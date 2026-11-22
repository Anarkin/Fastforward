import { imagePath } from './markdownRender';

const blockSources = new WeakMap<Node, string>();

function isElement(node: Node): node is Element {
  return node.nodeType === node.ELEMENT_NODE;
}

function sourceOf(node: Node): string {
  return isElement(node) ? node.outerHTML : (node.textContent ?? '');
}

interface ShownBlocks {
  readonly added: readonly Element[];
  readonly removed: readonly Element[];
}

export function showBlocks(element: Element, html: string): ShownBlocks {
  const parsed = element.ownerDocument.createElement('template');
  parsed.innerHTML = html;
  const kept = new Map<string, Node[][]>();
  let drawnBefore: Node[] = [];
  for (const node of element.childNodes) {
    drawnBefore.push(node);
    const source = blockSources.get(node);
    if (source !== undefined) {
      const same = kept.get(source);
      if (same) {
        same.push(drawnBefore);
      } else {
        kept.set(source, [drawnBefore]);
      }
      drawnBefore = [];
    }
  }
  const added: Element[] = [];
  const shown = [...parsed.content.childNodes].flatMap((node) => {
    const source = sourceOf(node);
    const same = kept.get(source)?.shift();
    if (same) {
      return same;
    }
    blockSources.set(node, source);
    if (isElement(node)) {
      added.push(node);
    }
    return [node];
  });
  element.replaceChildren(...shown);
  const removed = [...kept.values()]
    .flat()
    .map((nodes) => nodes.at(-1))
    .filter((node) => node !== undefined && isElement(node));
  return { added, removed };
}

export function showImages(
  element: ParentNode,
  url: (path: string) => string,
): void {
  for (const image of element.querySelectorAll(`img[${imagePath}]`)) {
    const src = url(image.getAttribute(imagePath) ?? '');
    if (image.getAttribute('src') !== src) {
      image.setAttribute('src', src);
    }
  }
}

export interface MarkdownImages {
  readonly path: (src: string) => string | undefined;
  readonly url: (path: string) => string;
}
