import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { wheeled, type Binding } from '../shell/shared/keymap';
import type { PdfPlace } from '../shared/pdf';
import type { PdfFound, ShownPdf } from './pdfDocument';

export type { PdfFound, ShownPdf };

export function PdfPane({
  url,
  size,
  zoomKeys,
  placeOf,
  onPlace,
  onFound,
  onShown,
}: {
  url: string;
  size: number;
  zoomKeys: Binding<true>;
  placeOf: (fingerprint: string) => Promise<PdfPlace | undefined>;
  onPlace: (fingerprint: string, place: PdfPlace) => void;
  onFound: (found: PdfFound) => void;
  onShown: (shown: ShownPdf | undefined) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const shown = useRef<ShownPdf>(undefined);
  const [failure, setFailure] = useState<string>();
  const placeOfEvent = useEffectEvent(placeOf);
  const placeEvent = useEffectEvent(onPlace);
  const foundEvent = useEffectEvent(onFound);
  const shownEvent = useEffectEvent(onShown);

  useEffect(() => {
    const element = container.current;
    if (element === null) {
      return undefined;
    }
    element.focus();
    const leaving = new AbortController();
    void import('./pdfDocument.js').then(({ showPdf, pdfFailure }) =>
      showPdf(
        element,
        url,
        size,
        {
          placeOf: (fingerprint) => placeOfEvent(fingerprint),
          onPlace: (fingerprint, place) => placeEvent(fingerprint, place),
          onFound: (found) => foundEvent(found),
        },
        leaving.signal,
      ).then(
        (opened: ShownPdf | undefined) => {
          if (opened !== undefined && !leaving.signal.aborted) {
            shown.current = opened;
            shownEvent(opened);
          }
        },
        (error: unknown) => {
          if (!leaving.signal.aborted) {
            setFailure(pdfFailure(error));
          }
        },
      ),
    );
    const zoom = (event: WheelEvent) => {
      if (wheeled(zoomKeys, event) === undefined || event.deltaY === 0) {
        return;
      }
      event.preventDefault();
      shown.current?.zoomBy(event.deltaY < 0 ? 1 : -1);
    };
    element.addEventListener('wheel', zoom, { passive: false });
    return () => {
      element.removeEventListener('wheel', zoom);
      leaving.abort();
      shown.current = undefined;
      shownEvent(undefined);
    };
  }, [url, size, zoomKeys]);

  return (
    <div className="pdf-pane">
      <div
        className="pdf-scroll"
        ref={container}
        tabIndex={0}
        data-column-focus=""
      >
        <div className="pdfViewer" />
      </div>
      {failure !== undefined && <div className="pdf-failure">{failure}</div>}
    </div>
  );
}
