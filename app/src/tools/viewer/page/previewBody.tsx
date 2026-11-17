import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { maxPreviewBytes } from '../shared/protocol';
import { viewedFileUrl } from '../shared/files';
import { strings } from '../../../lib/shared/strings';
import { Words } from '../../../lib/page/name';
import { documentImagePath } from './documentImages';
import { ImagePane } from '../../../lib/page/images';
import { imageType, vectorType } from '../../../lib/shared/images';
import { MarkdownPane } from './markdownView';
import { PdfPane } from './pdfView';
import { viewerKeymap } from './keymap';
import { useWholeText } from './wholeText';
import { keyPressed } from '../../../lib/page/shortcuts';
import { previewUrl, type Preview } from './previews';
import { imageScrolled } from './imageScroll';
import type { PdfControls } from './pdfPreview';
import type { Viewing } from './viewing';
import { useViewerActions } from './store';
import { blockAtTop, holdBlockAtTop } from './previewPlace';

const watchSize = (element: Element, changed: () => void) => {
  const observer = new ResizeObserver(changed);
  observer.observe(element);
  return () => observer.disconnect();
};

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
          {strings.viewer.previewTooLarge(maxPreviewBytes / 1024 / 1024)}
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
  const { tab } = viewing;
  const { keptViewer, keepViewer } = useViewerActions();
  const back = useRef(keptViewer(tab).preview);
  const centerImage = useCallback(() => {
    const scroller = body.current;
    const left = back.current;
    back.current = undefined;
    if (scroller && left !== undefined) {
      scroller.scrollTo({ top: left.top, left: left.left });
    } else if (scroller) {
      scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;
      scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) / 2;
    }
  }, []);
  const holding = useRef<() => void>(undefined);
  useEffect(() => () => holding.current?.(), []);
  useLayoutEffect(() => {
    const scroller = body.current;
    const left = back.current;
    if (
      preview !== 'markdown' ||
      scroller === null ||
      left === undefined ||
      holding.current !== undefined
    ) {
      return;
    }
    if (left.block === undefined) {
      back.current = undefined;
      scroller.scrollTop = left.top;
    } else if (scroller.querySelector('.markdown')?.firstElementChild) {
      holding.current = holdBlockAtTop(
        scroller,
        left,
        () => {
          back.current = undefined;
        },
        watchSize,
      );
    }
  });
  const keeping = useRef(0);
  useLayoutEffect(() => {
    if (preview === 'image' && !realSize) {
      back.current = undefined;
    }
  }, [preview, realSize]);
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
          options={pdf.options}
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
      onScroll={(event) => {
        const scroller = event.currentTarget;
        if (back.current !== undefined || keeping.current !== 0) {
          return;
        }
        keeping.current = requestAnimationFrame(() => {
          keeping.current = 0;
          if (back.current === undefined) {
            keepViewer(tab, {
              preview: {
                top: scroller.scrollTop,
                left: scroller.scrollLeft,
                ...blockAtTop(scroller),
              },
            });
          }
        });
      }}
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
