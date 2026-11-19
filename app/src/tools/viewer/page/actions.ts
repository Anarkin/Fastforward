import type { PdfPlace } from '../shared/pdf';
import { maxFindLength } from '../shared/protocol';
import type { ViewerToHost } from '../shared/protocol';
import type { ViewerActions } from './state';
import type { ToViewer } from './viewing';
import { arrived, awaiting } from '../../../lib/page/settling';

const readAwaited = 'viewer read';

const pdfPlaceWait = 2000;

const pdfPlaceEvery = 1000;

type StreamActions = Pick<
  ViewerActions,
  | 'request'
  | 'listenViewer'
  | 'findText'
  | 'readWholeText'
  | 'readPdfPlace'
  | 'keepPdfPlace'
  | 'flushPdfPlace'
>;

type Asked = ViewerToHost;

export function viewerActions(sent: (message: ViewerToHost) => void): {
  readonly actions: StreamActions;
  readonly heard: (message: ToViewer) => void;
  readonly awaitViewing: (tab: string | undefined) => void;
  readonly viewingCame: (tab: string) => void;
} {
  let awaited: string | undefined;
  let held: Asked[] = [];
  const post = (message: Asked) => {
    if (awaited !== undefined && 'tab' in message && message.tab === awaited) {
      held.push(message);
    } else {
      sent(message);
    }
  };
  const viewerListeners = new Set<(message: ToViewer) => void>();
  const listenViewer = (handler: (message: ToViewer) => void) => {
    viewerListeners.add(handler);
    return () => {
      viewerListeners.delete(handler);
    };
  };
  let viewerRequests = 0;
  let pendingPdfPlace:
    | {
        readonly tab: string;
        readonly fingerprint: string;
        readonly place: PdfPlace;
      }
    | undefined;
  let pdfPlaceTimer: ReturnType<typeof setTimeout> | undefined;
  const flushPdfPlace = () => {
    clearTimeout(pdfPlaceTimer);
    pdfPlaceTimer = undefined;
    const pending = pendingPdfPlace;
    pendingPdfPlace = undefined;
    if (pending !== undefined) {
      post({ type: 'savePdfPlace', ...pending });
    }
  };
  return {
    heard: (message) => {
      if (message.type !== 'found' && message.type !== 'pdfPlace') {
        arrived(readAwaited);
      }
      for (const handler of viewerListeners) {
        handler(message);
      }
    },
    awaitViewing: (tab) => {
      awaited = tab;
      held = [];
      if (tab === undefined) {
        arrived(readAwaited);
      }
    },
    viewingCame: (tab) => {
      if (awaited !== tab) {
        return;
      }
      awaited = undefined;
      for (const message of held.splice(0)) {
        sent(message);
      }
    },
    actions: {
      request: (message) => {
        awaiting(readAwaited);
        post(message);
      },
      listenViewer,
      findText: (tab, encoding, query, options, onFound) => {
        if (query.length > maxFindLength) {
          onFound({ matches: [], done: true });
          return () => undefined;
        }
        const request = ++viewerRequests;
        const stop = listenViewer((message) => {
          if (
            message.type === 'found' &&
            message.tab === tab &&
            message.request === request
          ) {
            onFound({ matches: message.matches, done: message.done });
          }
        });
        post({ type: 'findText', tab, encoding, query, options, request });
        return () => {
          stop();
          post({ type: 'stopFind', tab, request });
        };
      },
      readWholeText: (tab, encoding, onText) => {
        const request = ++viewerRequests;
        const stop = listenViewer((message) => {
          if (
            message.type === 'text' &&
            message.tab === tab &&
            message.request === request &&
            message.text !== undefined
          ) {
            onText(message.text);
          }
        });
        post({ type: 'readText', tab, encoding, request });
        return stop;
      },
      readPdfPlace: (tab, fingerprint) =>
        new Promise((resolve) => {
          const request = ++viewerRequests;
          const answered = (place: PdfPlace | undefined) => {
            clearTimeout(waiting);
            stop();
            resolve(place);
          };
          const waiting = setTimeout(() => answered(undefined), pdfPlaceWait);
          const stop = listenViewer((message) => {
            if (message.type === 'pdfPlace' && message.request === request) {
              answered(message.place);
            }
          });
          post({ type: 'readPdfPlace', tab, fingerprint, request });
        }),
      keepPdfPlace: (tab, fingerprint, place) => {
        pendingPdfPlace = { tab, fingerprint, place };
        pdfPlaceTimer ??= setTimeout(flushPdfPlace, pdfPlaceEvery);
      },
      flushPdfPlace,
    },
  };
}
