import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { wheeled, type Binding } from '../../../lib/shared/keymap';
import type { PdfPlace } from '../shared/pdf';
import type { PdfFound, ShownPdf } from './pdfDocument';

export function PdfPane({
  url,
  size,
  query,
  zoomKeys,
  placeOf,
  onPlace,
  onFound,
  onShown,
}: {
  url: string;
  size: number;
  query: string;
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
  const queryEvent = useEffectEvent(() => query);
  const opened = useRef(false);

  useLayoutEffect(() => () => shown.current?.tellPlace(), []);

  useEffect(() => {
    const element = container.current;
    if (element === null) {
      return undefined;
    }
    const reopened = opened.current;
    opened.current = true;
    const focused = element.ownerDocument.activeElement;
    if (
      !reopened ||
      focused === null ||
      focused === element.ownerDocument.body ||
      element.contains(focused)
    ) {
      element.focus();
    }
    if (reopened && queryEvent() !== '') {
      foundEvent({ current: 0, total: 0, done: false });
    }
    setFailure(undefined);
    const leaving = new AbortController();
    void import('./pdfDocument.js').then(({ showPdf, pdfFailure }) => {
      if (leaving.signal.aborted) {
        return;
      }
      const failed = (error: unknown) => {
        if (!leaving.signal.aborted) {
          setFailure(pdfFailure(error));
        }
      };
      void showPdf(
        element,
        url,
        size,
        {
          placeOf: (fingerprint) => placeOfEvent(fingerprint),
          onPlace: (fingerprint, place) => placeEvent(fingerprint, place),
          onFound: (found) => foundEvent(found),
          onFailure: failed,
        },
        leaving.signal,
      ).then((pdf: ShownPdf | undefined) => {
        if (pdf !== undefined && !leaving.signal.aborted) {
          shown.current = pdf;
          shownEvent(pdf);
          const finding = queryEvent();
          if (finding !== '') {
            pdf.find(finding, 0);
          }
        }
      }, failed);
    });
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
