import { useMemo } from 'react';
import { documentImageUrl, type DocumentImages } from './images';
import { strings } from '../../../shared/strings';
import type { MarkdownSide } from './previews';
import { documentImagePath } from '../../../ui/images';
import { MarkdownPane } from '../../../ui/markdownView';

function SidePane({
  text,
  images,
}: {
  text: string | undefined;
  images: DocumentImages | undefined;
}) {
  const { root, document, revision, version } = images ?? {};
  const shown = useMemo(
    () =>
      root === undefined || document === undefined || version === undefined
        ? undefined
        : {
            path: (src: string) => documentImagePath(document, src),
            url: (path: string) =>
              documentImageUrl({ root, revision, version }, path),
          },
    [root, document, revision, version],
  );
  return <MarkdownPane text={text} images={shown} />;
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
          <SidePane key={side} text={text} images={images} />
        );
      })}
    </div>
  );
}
