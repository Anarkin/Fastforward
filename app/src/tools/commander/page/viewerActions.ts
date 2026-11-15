import type { PdfPlace } from '../shared/pdf';
import { maxFindLength } from '../shared/protocol';
import type { CommanderActions, ToViewer } from './commanderState';
import type { StoreParts } from './dialogActions';

const pdfPlaceWait = 2000;

const pdfPlaceEvery = 1000;

type ViewerActions = Pick<
  CommanderActions,
  | 'request'
  | 'listenViewer'
  | 'findText'
  | 'readWholeText'
  | 'readPdfPlace'
  | 'keepPdfPlace'
  | 'flushPdfPlace'
  | 'placeOf'
  | 'keepPlace'
>;

export function viewerActions({ post }: StoreParts): {
  readonly actions: ViewerActions;
  readonly heard: (message: ToViewer) => void;
  readonly forget: (tab: string) => void;
} {
  const places = new Map<string, number>();
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
      for (const handler of viewerListeners) {
        handler(message);
      }
    },
    forget: (tab) => {
      places.delete(tab);
    },
    actions: {
      request: post,
      listenViewer,
      findText: (tab, encoding, query, onFound) => {
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
        post({ type: 'findText', tab, encoding, query, request });
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
      placeOf: (tab) => places.get(tab) ?? 0,
      keepPlace: (tab, byte) => {
        places.set(tab, byte);
      },
    },
  };
}
