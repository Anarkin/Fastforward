import type { PdfPlace } from '../shared/pdf';
import { maxFindLength } from '../shared/protocol';
import type { ViewerToHost } from '../shared/protocol';
import type { ViewerActions } from './viewerState';
import type { ToViewer } from './viewing';
import { noSearch } from '../../../lib/shared/searchOptions';
import type { ViewerView } from './tabView';
import { RecentCache } from './recentCache';
import {
  maxCachedViewers,
  noKeptViewer,
  cachesOf,
  withoutCaches,
  type KeptViewer,
} from './viewerKept';

const pdfPlaceWait = 2000;

const pdfPlaceEvery = 1000;

type ViewerKept = Omit<ViewerView, 'choices'>;

type StreamActions = Pick<
  ViewerActions,
  | 'request'
  | 'listenViewer'
  | 'findText'
  | 'readWholeText'
  | 'readPdfPlace'
  | 'keepPdfPlace'
  | 'flushPdfPlace'
  | 'placeOf'
  | 'keepPlace'
  | 'keptViewer'
  | 'keepViewer'
>;

type Asked = ViewerToHost;

export function viewerActions(sent: (message: ViewerToHost) => void): {
  readonly actions: StreamActions;
  readonly heard: (message: ToViewer) => void;
  readonly forget: (tab: string) => void;
  readonly awaitViewing: (tab: string | undefined) => void;
  readonly viewingCame: (tab: string) => void;
  readonly kept: (tab: string) => ViewerKept;
  readonly restore: (tab: string, kept: ViewerKept) => void;
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
  const places = new Map<string, number>();
  const keptViewers = new Map<string, KeptViewer>();
  const caches = new RecentCache<Partial<KeptViewer>>(maxCachedViewers);
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
      keptViewers.delete(tab);
      caches.forget(tab);
    },
    kept: (tab) => {
      const kept = keptViewers.get(tab) ?? noKeptViewer;
      return {
        place: places.get(tab),
        finding: kept.finding,
        search: kept.search,
        current: kept.current,
        focus: kept.focus,
        sideways: kept.sideways,
        preview: kept.preview,
        pdfFind: kept.pdfFind,
      };
    },
    restore: (tab, kept) => {
      if (kept.place === undefined) {
        places.delete(tab);
      } else {
        places.set(tab, kept.place);
      }
      caches.keep(tab, {});
      keptViewers.set(tab, {
        ...noKeptViewer,
        finding: kept.finding ?? false,
        search: kept.search ?? noSearch,
        current: kept.current ?? 0,
        focus: kept.focus,
        sideways: kept.sideways,
        preview: kept.preview,
        pdfFind: kept.pdfFind,
      });
    },
    awaitViewing: (tab) => {
      awaited = tab;
      held = [];
      if (tab !== undefined) {
        caches.shown(tab);
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
      request: post,
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
      placeOf: (tab) => places.get(tab) ?? 0,
      keepPlace: (tab, byte) => {
        places.set(tab, byte);
      },
      keptViewer: (tab) => ({
        ...(keptViewers.get(tab) ?? noKeptViewer),
        ...caches.of(tab),
      }),
      keepViewer: (tab, change) => {
        keptViewers.set(tab, {
          ...(keptViewers.get(tab) ?? noKeptViewer),
          ...withoutCaches(change),
        });
        caches.keep(tab, { ...caches.of(tab), ...cachesOf(change) });
      },
    },
  };
}
