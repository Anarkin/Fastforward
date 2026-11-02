import { useEffect, useMemo, useRef } from 'react';
import { maxPreviewBytes, type CommanderToHost } from '../shared/protocol';
import { viewedFileUrl } from '../shared/files';
import { strings } from '../../../shared/strings';
import { documentImagePath, ImagePane } from '../../../ui/images';
import { MarkdownPane } from '../../../ui/markdownView';
import { PdfPane } from '../../../ui/pdfView';
import { viewerKeymap } from '../shared/keymap';
import { useWholeText } from './textBody';
import { previewUrl, type Preview } from './previews';
import type { PdfControls } from './pdfPreview';
import type { ToViewer, Viewing } from './viewer';

function MarkdownPreview({
  file,
  viewing,
  post,
  listen,
}: {
  file: string;
  viewing: Viewing;
  post: (message: CommanderToHost) => void;
  listen: (handler: (message: ToViewer) => void) => () => void;
}) {
  const tooLarge = viewing.size !== undefined && viewing.size > maxPreviewBytes;
  const text = useWholeText(viewing, post, listen, !tooLarge, 'utf-8');
  const { tab, version } = viewing;
  const images = useMemo(() => {
    const document = file.replaceAll('\\', '/');
    return {
      path: (src: string) => documentImagePath(document, src),
      url: (path: string) => viewedFileUrl(tab, path, version),
    };
  }, [file, tab, version]);
  if (tooLarge) {
    return (
      <div className="markdown-pane">
        <div className="markdown-note">
          {strings.commander.previewTooLarge(maxPreviewBytes / 1024 / 1024)}
        </div>
      </div>
    );
  }
  return <MarkdownPane text={text} images={images} />;
}

export function PreviewBody({
  file,
  preview,
  viewing,
  pdf,
  post,
  listen,
}: {
  file: string;
  preview: Preview;
  viewing: Viewing;
  pdf: PdfControls;
  post: (message: CommanderToHost) => void;
  listen: (handler: (message: ToViewer) => void) => () => void;
}) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => body.current?.focus(), []);
  if (
    preview === 'pdf' &&
    viewing.error === undefined &&
    viewing.size !== undefined
  ) {
    return (
      <div className="column-body viewer-body viewer-pdf">
        <PdfPane
          url={previewUrl(viewing, file)}
          size={viewing.size}
          zoomKeys={viewerKeymap.zoomPdf}
          placeOf={pdf.placeOf}
          onPlace={pdf.onPlace}
          onFound={pdf.onFound}
          onShown={pdf.onShown}
        />
      </div>
    );
  }
  const imageUrl = previewUrl(viewing, file);
  return (
    <div
      className="column-body viewer-body viewer-preview"
      ref={body}
      tabIndex={0}
      data-column-focus=""
    >
      {viewing.error !== undefined ? (
        <div className="viewer-error">{viewing.error}</div>
      ) : preview === 'image' ? (
        <div className="viewer-image">
          <ImagePane key={imageUrl} url={imageUrl} />
        </div>
      ) : (
        <MarkdownPreview
          file={file}
          viewing={viewing}
          post={post}
          listen={listen}
        />
      )}
    </div>
  );
}
