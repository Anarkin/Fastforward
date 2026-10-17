import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  documentImagePath,
  documentImageUrl,
  type DocumentImages,
} from './images';
import { imagePath, markdownRenderer, type Render } from './markdownRender';
import { strings } from '../shared/strings';
import type { MarkdownSide } from './previews';
import { onceMade } from './onceMade';
import { codeSegments, colorCode } from './syntax';

const codeLanguage = /(?:^|\s)language-(\S+)/;

function colorCodeBlocks(element: HTMLElement): () => void {
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
    return render(
      text,
      document === undefined
        ? noImages
        : (src: string) => documentImagePath(document, src),
    );
  }, [render, text, document]);
  const content = useRef<HTMLDivElement>(null);
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
  useEffect(
    () =>
      content.current && html !== undefined
        ? colorCodeBlocks(content.current)
        : undefined,
    [html],
  );
  return (
    <div className="markdown-pane">
      <div
        ref={content}
        className="markdown"
        dangerouslySetInnerHTML={
          html === undefined ? undefined : { __html: html }
        }
      />
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
