import { useEffect, useMemo, useState } from 'react';
import { markdownRenderer, type Render } from './markdownRender';
import type { MarkdownSide } from './previews';

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

function MarkdownPane({ text }: { text: string | undefined }) {
  const render = useRenderer();
  const html = useMemo(
    () =>
      render && text !== undefined
        ? { __html: render(text, noImages) }
        : undefined,
    [render, text],
  );
  return (
    <div className="markdown-pane">
      <div className="markdown" dangerouslySetInnerHTML={html} />
    </div>
  );
}

export function MarkdownDiff({ sides }: { sides: readonly MarkdownSide[] }) {
  return (
    <div className="markdown-diff">
      {sides.map(({ side, text, present }) =>
        present ? (
          <MarkdownPane key={side} text={text} />
        ) : (
          <div key={side} className="markdown-pane filler" />
        ),
      )}
    </div>
  );
}
