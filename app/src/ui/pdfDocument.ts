import {
  AnnotationEditorType,
  AnnotationMode,
  getDocument,
  GlobalWorkerOptions,
  InvalidPDFException,
  PasswordException,
  PDFDataRangeTransport,
} from 'pdfjs-dist';
import {
  EventBus,
  FindState,
  PDFFindController,
  PDFLinkService,
  PDFViewer,
} from 'pdfjs-dist/web/pdf_viewer.mjs';
import { strings } from '../shared/strings';
import { pdfPlaceOf, type PdfPlace } from '../shared/pdf';
import { pdfText } from './pdfText';

const textLayerOn = 1;

export interface PdfFound {
  readonly current: number;
  readonly total: number;
  readonly done: boolean;
}

export interface ShownPdf {
  readonly fingerprint: string;
  readonly find: (query: string, step: 0 | 1 | -1) => void;
  readonly closeFind: () => void;
  readonly zoomBy: (steps: number) => void;
  readonly tellPlace: () => void;
  readonly close: () => void;
}

export interface PdfEvents {
  readonly placeOf: (fingerprint: string) => Promise<PdfPlace | undefined>;
  readonly onPlace: (fingerprint: string, place: PdfPlace) => void;
  readonly onFound: (found: PdfFound) => void;
}

const assetUrl = (path: string) => new URL(path, document.baseURI).href;

class FileRanges extends PDFDataRangeTransport {
  readonly #url: string;
  readonly #signal: AbortSignal;

  constructor(url: string, size: number, signal: AbortSignal) {
    super(size, null);
    this.#url = url;
    this.#signal = signal;
  }

  override requestDataRange(begin: number, end: number): void {
    void fetch(this.#url, {
      headers: { range: `bytes=${begin}-${end - 1}` },
      signal: this.#signal,
    })
      .then((response) => response.arrayBuffer())
      .then(
        (bytes) => this.onDataRange(begin, new Uint8Array(bytes)),
        () => undefined,
      );
  }
}

export function pdfFailure(error: unknown): string {
  if (error instanceof PasswordException) {
    return strings.pdf.needsPassword;
  }
  if (error instanceof InvalidPDFException) {
    return strings.pdf.invalid;
  }
  return strings.pdf.couldNotOpen(
    error instanceof Error ? error.message : String(error),
  );
}

function shownPlace(viewer: PDFViewer, place: PdfPlace): void {
  const page = Math.min(place.page, viewer.pagesCount);
  viewer.currentScaleValue =
    typeof place.zoom === 'number' ? String(place.zoom / 100) : place.zoom;
  viewer.scrollPageIntoView({
    pageNumber: page,
    destArray: [
      null,
      { name: 'XYZ' },
      place.left,
      page === place.page ? place.top : null,
      null,
    ],
    allowNegativeOffset: true,
  });
}

export async function showPdf(
  container: HTMLDivElement,
  url: string,
  size: number,
  events: PdfEvents,
  signal: AbortSignal,
): Promise<ShownPdf | undefined> {
  GlobalWorkerOptions.workerSrc ||= assetUrl('pdfWorker.js');
  const eventBus = new EventBus();
  const linkService = new PDFLinkService({ eventBus });
  linkService.externalLinkEnabled = false;
  const findController = new PDFFindController({
    eventBus,
    linkService,
    updateMatchesCountOnProgress: true,
  });
  const options: ConstructorParameters<typeof PDFViewer>[0] = {
    container,
    eventBus,
    linkService,
    findController,
    textLayerMode: textLayerOn,
    annotationMode: AnnotationMode.ENABLE,
    annotationEditorMode: AnnotationEditorType.DISABLE,
  };
  const text = pdfText();
  Reflect.set(options, 'l10n', text);
  void text.translate(container);
  const viewer = new PDFViewer(options);
  linkService.setViewer(viewer);
  const task = getDocument({
    range: new FileRanges(assetUrl(url), size, signal),
    cMapUrl: assetUrl('pdfjs/cmaps/'),
    standardFontDataUrl: assetUrl('pdfjs/standard_fonts/'),
    wasmUrl: assetUrl('pdfjs/wasm/'),
    iccUrl: assetUrl('pdfjs/iccs/'),
    enableXfa: false,
    disableAutoFetch: true,
    disableStream: true,
  });
  const close = () => {
    void text.destroy();
    viewer.cleanup();
    void task.destroy();
  };
  signal.addEventListener('abort', close, { once: true });
  const pdf = await task.promise;
  const fingerprint = pdf.fingerprints[0] ?? '';
  const remembered = await events.placeOf(fingerprint);
  if (signal.aborted) {
    return undefined;
  }
  let restored = false;
  eventBus.on('pagesinit', () => {
    if (remembered === undefined) {
      viewer.currentScaleValue = 'auto';
    } else {
      shownPlace(viewer, remembered);
    }
    restored = true;
  });
  eventBus.on('updateviewarea', ({ location }: { location: unknown }) => {
    const place = pdfPlaceOf(location);
    if (restored && place !== undefined) {
      events.onPlace(fingerprint, place);
    }
  });
  const found = ({
    matchesCount,
    state,
  }: {
    matchesCount?: { current: number; total: number };
    state?: number;
  }) =>
    events.onFound({
      current: matchesCount?.current ?? 0,
      total: matchesCount?.total ?? 0,
      done: state === undefined || state !== FindState.PENDING,
    });
  eventBus.on('updatefindmatchescount', found);
  eventBus.on('updatefindcontrolstate', found);
  viewer.setDocument(pdf);
  linkService.setDocument(pdf);
  return {
    fingerprint,
    find: (query, step) =>
      eventBus.dispatch('find', {
        source: null,
        type: step === 0 ? '' : 'again',
        query,
        caseSensitive: false,
        entireWord: false,
        highlightAll: true,
        findPrevious: step === -1,
        matchDiacritics: false,
      }),
    closeFind: () => eventBus.dispatch('findbarclose', { source: null }),
    zoomBy: (steps) => viewer.updateScale({ steps }),
    tellPlace: () => {
      if (restored) {
        viewer.update();
      }
    },
    close,
  };
}
