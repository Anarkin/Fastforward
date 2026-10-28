import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { mermaidDrawer, showDiagrams } from '../../../ui/diagrams';
import {
  documentImagePath,
  documentImageUrl,
  type DocumentImages,
} from './images';
import {
  imagePath,
  markdownRenderer,
  type Render,
} from '../../../ui/markdownRender';
import { strings } from '../../../shared/strings';
import type { MarkdownSide } from './previews';
import { onceMade } from '../../../ui/onceMade';
import { codeSegments, colorCode } from './syntax';

const codeLanguage = /(?:^|\s)language-(\S+)/;

function colorCodeBlocks(element: ParentNode): () => void {
  const leaving = new AbortController();
  for (const code of element.querySelectorAll('pre > code')) {
    const language = codeLanguage.exec(code.className)?.[1];
    const text = code.textContent;
    if (language === undefined) {
      continue;
    }
    void colorCode(language, text, leaving.signal).then((lines) => {
      if (leaving.signal.aborted || !lines || code.textContent !== text) {
        return;
      }
      code.replaceChildren(
        ...codeSegments(text, lines).map(({ text: part, kind }) => {
          if (kind === undefined) {
            return part;
          }
          const span = document.createElement('span');
          span.className = `syntax-${kind}`;
          span.textContent = part;
          return span;
        }),
      );
    });
  }
  return () => leaving.abort();
}

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

let loaded: Render | undefined;

const loadRenderer = onceMade(() =>
  Promise.all([import('dompurify'), import('markdown-it')]).then(
    ([{ default: purify }, { default: markdownIt }]) => {
      const render = markdownRenderer(purify, markdownIt);
      loaded = render;
      return render;
    },
  ),
);

function useRenderer(): Render | undefined {
  const [render, setRender] = useState(() => loaded);
  useEffect(() => {
    if (render) {
      return undefined;
    }
    let live = true;
    loadRenderer().then((ready) => {
      if (live) {
        setRender(() => ready);
      }
    }, reportError);
    return () => {
      live = false;
    };
  }, [render]);
  return render;
}

const noImages = () => undefined;

const loadMermaid = onceMade(() =>
  import('mermaid').then(({ default: mermaid }) => mermaid),
);

const darkScheme = '(prefers-color-scheme: dark)';

function useDark(): boolean {
  return useSyncExternalStore(
    (changed) => {
      const query = matchMedia(darkScheme);
      query.addEventListener('change', changed);
      return () => query.removeEventListener('change', changed);
    },
    () => matchMedia(darkScheme).matches,
    () => false,
  );
}

function stopDrawing(blocks: Map<Element, () => void>): void {
  for (const stop of blocks.values()) {
    stop();
  }
  blocks.clear();
}

function MarkdownPane({
  text,
  images,
}: {
  text: string | undefined;
  images: DocumentImages | undefined;
}) {
  const render = useRenderer();
  const dark = useDark();
  const { root, document, revision, version } = images ?? {};
  const html = useMemo(() => {
    if (!render || text === undefined) {
      return undefined;
    }
    return render(
      text,
      document === undefined
        ? noImages
        : (src: string) => documentImagePath(document, src),
    );
  }, [render, text, document]);
  const content = useRef<HTMLDivElement>(null);
  const drawn = useRef(new Map<Element, () => void>());
  const drawnDark = useRef(dark);
  useLayoutEffect(() => {
    const element = content.current;
    if (!element || html === undefined) {
      return;
    }
    if (drawnDark.current !== dark) {
      stopDrawing(drawn.current);
      element.replaceChildren();
      drawnDark.current = dark;
    }
    const { added, removed } = showBlocks(element, html);
    for (const block of removed) {
      drawn.current.get(block)?.();
      drawn.current.delete(block);
    }
    const drawer = () =>
      loadMermaid().then((mermaid) =>
        mermaidDrawer(mermaid, {
          dark,
          fontFamily: getComputedStyle(element).fontFamily,
        }),
      );
    for (const block of added) {
      const stopColoring = colorCodeBlocks(block);
      const stopDiagrams = showDiagrams(block, drawer);
      drawn.current.set(block, () => {
        stopColoring();
        stopDiagrams();
      });
    }
  }, [html, dark]);
  useEffect(() => {
    const element = content.current;
    const blocks = drawn.current;
    return () => {
      stopDrawing(blocks);
      element?.replaceChildren();
    };
  }, []);
  useLayoutEffect(() => {
    if (
      content.current &&
      html !== undefined &&
      root !== undefined &&
      version !== undefined
    ) {
      showImages(content.current, (path) =>
        documentImageUrl({ root, revision, version }, path),
      );
    }
  }, [html, root, revision, version]);
  return (
    <div className="markdown-pane">
      <div ref={content} className="markdown" />
    </div>
  );
}

export function MarkdownDiff({ sides }: { sides: readonly MarkdownSide[] }) {
  return (
    <div className="markdown-diff">
      {sides.map(({ side, text, present, unreadable, images }) => {
        if (!present) {
          return <div key={side} className="markdown-pane filler" />;
        }
        if (unreadable) {
          return (
            <div key={side} className="markdown-pane">
              <div className="markdown-note">{strings.diff.binaryOrLarge}</div>
            </div>
          );
        }
        return text === '' ? (
          <div key={side} className="markdown-pane">
            <div className="markdown-note">{strings.diff.emptyFile}</div>
          </div>
        ) : (
          <MarkdownPane key={side} text={text} images={images} />
        );
      })}
    </div>
  );
}
