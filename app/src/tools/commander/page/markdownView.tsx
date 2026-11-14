import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { mermaidDrawer, showDiagrams } from './diagrams';
import { markdownRenderer, type Render } from './markdownRender';
import { onceMade } from '../../../lib/page/onceMade';
import { codeSegments, colorCode } from '../../../lib/page/syntax';
import {
  elementWidths,
  useCellTable,
  type TextWidths,
} from '../../../lib/page/textWidths';
import {
  cellNodes,
  boxCodeBlocks,
  showBlocks,
  showImages,
  type MarkdownImages,
} from './markdownBlocks';

const codeLanguage = /(?:^|\s)language-(\S+)/;

function colorCodeBlocks(
  element: ParentNode,
  widths: TextWidths | undefined,
): () => void {
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
        ...codeSegments(text, lines)
          .map(({ text: part, kind }) => {
            if (kind === undefined) {
              return cellNodes(code, part, widths);
            }
            const span = document.createElement('span');
            span.className = `syntax-${kind}`;
            span.append(...cellNodes(code, part, widths));
            return [span];
          })
          .flat(),
      );
    });
  }
  return () => leaving.abort();
}

let loaded: Render | undefined;

const loadRenderer = onceMade(() =>
  Promise.all([import('dompurify'), import('markdown-it')]).then(
    ([{ default: purify }, { default: markdownIt }]) => {
      const render = markdownRenderer(purify(window), markdownIt);
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

export function MarkdownPane({
  text,
  images,
}: {
  text: string | undefined;
  images: MarkdownImages | undefined;
}) {
  const render = useRenderer();
  const table = useCellTable();
  const dark = useDark();
  const imagePathOf = images?.path;
  const imageUrlOf = images?.url;
  const html = useMemo(() => {
    if (!render || text === undefined || table === undefined) {
      return undefined;
    }
    return render(text, imagePathOf ?? noImages);
  }, [render, text, imagePathOf, table]);
  const content = useRef<HTMLDivElement>(null);
  const drawn = useRef(new Map<Element, () => void>());
  const drawnDark = useRef(dark);
  const showDocumentImages = useEffectEvent((element: ParentNode) => {
    if (imageUrlOf !== undefined) {
      showImages(element, imageUrlOf);
    }
  });
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
    const code = element.querySelector('pre > code');
    const widths =
      code === null || table === undefined
        ? undefined
        : elementWidths(code, table);
    for (const block of added) {
      boxCodeBlocks(block, widths);
      const stopColoring = colorCodeBlocks(block, widths);
      const stopDiagrams = showDiagrams(block, drawer);
      drawn.current.set(block, () => {
        stopColoring();
        stopDiagrams();
      });
    }
    showDocumentImages(element);
  }, [html, dark, table]);
  useEffect(() => {
    const element = content.current;
    const blocks = drawn.current;
    return () => {
      stopDrawing(blocks);
      element?.replaceChildren();
    };
  }, []);
  useLayoutEffect(() => {
    if (content.current && html !== undefined && imageUrlOf !== undefined) {
      showImages(content.current, imageUrlOf);
    }
  }, [html, imageUrlOf]);
  return (
    <div className="markdown-pane">
      <div ref={content} className="markdown" />
    </div>
  );
}
