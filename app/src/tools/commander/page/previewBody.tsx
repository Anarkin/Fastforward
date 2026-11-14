import { useCallback, useEffect, useMemo, useRef } from 'react';
import { maxPreviewBytes } from '../shared/protocol';
import { viewedFileUrl } from '../shared/files';
import { strings } from '../../../lib/shared/strings';
import { Words } from '../../../lib/page/name';
import { documentImagePath } from '../../../lib/page/imageSizes';
import { ImagePane } from '../../../lib/page/images';
import { imageType, vectorType } from '../../../lib/shared/images';
import { MarkdownPane } from './markdownView';
import { PdfPane } from './pdfView';
import { viewerKeymap } from './keymap';
import { useWholeText } from './textScroll';
import { keyPressed } from '../../../lib/page/shortcuts';
import { imageScrolled, previewUrl, type Preview } from './previews';
import type { PdfControls } from './pdfPreview';
import type { Viewing } from './commanderState';

function MarkdownPreview({
  file,
  viewing,
}: {
  file: string;
  viewing: Viewing;
}) {
  const tooLarge = viewing.size !== undefined && viewing.size > maxPreviewBytes;
  const text = useWholeText(viewing, !tooLarge, 'utf-8')?.text;
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
  realSize,
  pdf,
}: {
  file: string;
  preview: Preview;
  viewing: Viewing;
  realSize: boolean;
  pdf: PdfControls;
}) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => body.current?.focus(), []);
  const centerImage = useCallback(() => {
    const scroller = body.current;
    if (scroller) {
      scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;
      scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) / 2;
    }
  }, []);
  const vector = imageType(file) === vectorType;
  const sizing = useMemo(
    () => ({ vector, realSize, onRealSize: centerImage }),
    [vector, realSize, centerImage],
  );
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
          query={pdf.query}
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
      onKeyDown={(event) => {
        const scroller = body.current;
        if (preview !== 'image' || scroller === null) {
          return;
        }
        const step =
          keyPressed(viewerKeymap.scroll, event) ??
          keyPressed(viewerKeymap.scrollSideways, event);
        if (step === undefined) {
          return;
        }
        event.preventDefault();
        const { top, left } = imageScrolled(scroller, step);
        scroller.scrollTo({ top, left });
      }}
    >
      {viewing.error !== undefined ? (
        <div className="viewer-error">
          <Words>{viewing.error}</Words>
        </div>
      ) : preview === 'image' ? (
        <div className={`viewer-image${realSize ? ' real-size' : ''}`}>
          <ImagePane key={imageUrl} url={imageUrl} sizing={sizing} />
        </div>
      ) : (
        <MarkdownPreview file={file} viewing={viewing} />
      )}
    </div>
  );
}
