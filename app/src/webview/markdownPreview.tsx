import { useEffect, useMemo, useRef, useState } from 'react';
import { documentImageUrl, type DocumentImages } from './images';
import { markdownRenderer, type Render } from './markdownRender';
import { strings } from '../shared/strings';
import type { MarkdownSide } from './previews';
import { codeSegments, colorCode } from './syntax';

const codeLanguage = /(?:^|\s)language-(\S+)/;

function colorCodeBlocks(element: HTMLElement): () => void {
  let live = true;
  for (const code of element.querySelectorAll('pre > code')) {
    const language = codeLanguage.exec(code.className)?.[1];
    const text = code.textContent;
    if (language === undefined) {
      continue;
    }
    void colorCode(language, text).then((lines) => {
      if (!live || !lines || code.textContent !== text) {
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
  return () => {
    live = false;
  };
}

let loading: Promise<Render> | undefined;
let loaded: Render | undefined;

function loadRenderer(): Promise<Render> {
  loading ??= Promise.all([import('dompurify'), import('markdown-it')]).then(
    ([{ default: purify }, { default: markdownIt }]) => {
      const render = markdownRenderer(purify, markdownIt);
      loaded = render;
      return render;
    },
  );
  return loading;
}

function useRenderer(): Render | undefined {
  const [render, setRender] = useState(() => loaded);
  useEffect(() => {
    if (render) {
      return undefined;
    }
    let live = true;
    void loadRenderer().then((ready) => {
      if (live) {
        setRender(() => ready);
      }
    });
    return () => {
      live = false;
    };
  }, [render]);
  return render;
}

const noImages = () => undefined;

function MarkdownPane({
  text,
  images,
}: {
  text: string | undefined;
  images: DocumentImages | undefined;
}) {
  const render = useRenderer();
  const { root, document, revision, version } = images ?? {};
  const html = useMemo(() => {
    if (!render || text === undefined) {
      return undefined;
    }
    const image =
      root === undefined || document === undefined || version === undefined
        ? noImages
        : (src: string) =>
            documentImageUrl({ root, document, revision, version }, src);
    return { __html: render(text, image) };
  }, [render, text, root, document, revision, version]);
  const content = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      content.current && html ? colorCodeBlocks(content.current) : undefined,
    [html],
  );
  return (
    <div className="markdown-pane">
      <div ref={content} className="markdown" dangerouslySetInnerHTML={html} />
    </div>
  );
}

export function MarkdownDiff({ sides }: { sides: readonly MarkdownSide[] }) {
  return (
    <div className="markdown-diff">
      {sides.map(({ side, text, present, images }) => {
        if (!present) {
          return (
            <div
              key={side}
              className={`markdown-pane filler ${side === 'old' ? 'addition' : 'removal'}`}
            />
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
