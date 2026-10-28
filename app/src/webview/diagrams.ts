import type { MermaidConfig, RenderResult } from 'mermaid';
import { strings } from '../shared/strings';

export type DrawDiagram = (source: string) => Promise<string>;

interface Mermaid {
  initialize: (config: MermaidConfig) => void;
  render: (id: string, source: string) => Promise<RenderResult>;
}

let diagrams = 0;

export function mermaidDrawer(
  mermaid: Mermaid,
  { dark, fontFamily }: { dark: boolean; fontFamily: string },
): DrawDiagram {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    theme: dark ? 'dark' : 'default',
    fontFamily,
  });
  return async (source) => {
    diagrams++;
    const { svg } = await mermaid.render(
      `markdown-diagram-${diagrams}`,
      source,
    );
    return svg;
  };
}

function asXml(document: Document, svg: string): Element | null {
  const parsed = document.createElement('template');
  parsed.innerHTML = svg;
  for (const element of parsed.content.querySelectorAll('[xmlns]')) {
    element.removeAttribute('xmlns');
  }
  return parsed.content.querySelector('svg');
}

function diagramImage(document: Document, svg: string): HTMLElement {
  const frame = document.createElement('div');
  frame.className = 'markdown-diagram';
  const image = document.createElement('img');
  image.alt = strings.diff.diagram;
  const root = asXml(document, svg);
  const [, , width, height] = (root?.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (width > 0 && height > 0) {
    image.setAttribute('width', String(Math.ceil(width)));
    image.setAttribute('height', String(Math.ceil(height)));
  }
  const xml =
    root && document.defaultView
      ? new document.defaultView.XMLSerializer().serializeToString(root)
      : '';
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  frame.append(image);
  return frame;
}

export function showDiagrams(
  element: ParentNode,
  drawer: () => Promise<DrawDiagram>,
): () => void {
  const blocks = [
    ...element.querySelectorAll<HTMLElement>('pre > code.language-mermaid'),
  ].flatMap((code) => (code.parentElement ? [code.parentElement] : []));
  if (blocks.length === 0) {
    return () => undefined;
  }
  const leaving = new AbortController();
  const added: Element[] = [];
  const shown = (pre: HTMLElement, shownBefore: HTMLElement) => {
    pre.before(shownBefore);
    added.push(shownBefore);
  };
  void drawer().then(
    (draw) => {
      for (const pre of blocks) {
        draw(pre.textContent).then(
          (svg) => {
            if (!leaving.signal.aborted) {
              shown(pre, diagramImage(pre.ownerDocument, svg));
              pre.hidden = true;
            }
          },
          () => {
            if (!leaving.signal.aborted) {
              const note = pre.ownerDocument.createElement('div');
              note.className = 'markdown-note';
              note.textContent = strings.diff.diagramFailed;
              shown(pre, note);
            }
          },
        );
      }
    },
    (error: unknown) => reportError(error),
  );
  return () => {
    leaving.abort();
    for (const shownBefore of added) {
      shownBefore.remove();
    }
    for (const pre of blocks) {
      pre.hidden = false;
    }
  };
}
