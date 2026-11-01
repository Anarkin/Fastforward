import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { CommanderToHost } from '../shared/protocol';
import type { PdfPlace } from '../../../shared/pdf';
import { strings } from '../../../shared/strings';
import { matchCount } from '../../../shared/textMatches';
import type { PdfFound, ShownPdf } from '../../../ui/pdfView';
import type { ToViewer } from './viewer';

const placeWait = 2000;
const placeEvery = 1000;
let lastAsk = 0;

export function pdfFindCount(
  query: string,
  found: PdfFound | undefined,
): string {
  if (query === '') {
    return '';
  }
  return found === undefined || (found.total === 0 && !found.done)
    ? strings.find.searching
    : matchCount(query, found.total, Math.max(0, found.current - 1));
}

export interface PdfControls {
  readonly placeOf: (fingerprint: string) => Promise<PdfPlace | undefined>;
  readonly onPlace: (fingerprint: string, place: PdfPlace) => void;
  readonly onFound: (found: PdfFound) => void;
  readonly onShown: (shown: ShownPdf | undefined) => void;
}

export function usePdfPreview(
  tab: string | undefined,
  post: (message: CommanderToHost) => void,
  listen: (handler: (message: ToViewer) => void) => () => void,
) {
  const shown = useRef<ShownPdf>(undefined);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<PdfFound>();
  const pending = useRef<{ fingerprint: string; place: PdfPlace }>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const viewer = useRef(tab);
  useLayoutEffect(() => {
    viewer.current = tab;
  });
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const last = pending.current;
    pending.current = undefined;
    if (last !== undefined && viewer.current !== undefined) {
      post({ type: 'savePdfPlace', tab: viewer.current, ...last });
    }
  }, [post]);
  useEffect(() => flush, [flush]);

  const controls: PdfControls = {
    placeOf: (fingerprint) =>
      new Promise((resolve) => {
        if (tab === undefined) {
          resolve(undefined);
          return;
        }
        const request = ++lastAsk;
        const answered = (place: PdfPlace | undefined) => {
          clearTimeout(waiting);
          stop();
          resolve(place);
        };
        const waiting = setTimeout(() => answered(undefined), placeWait);
        const stop = listen((message) => {
          if (message.type === 'pdfPlace' && message.request === request) {
            answered(message.place);
          }
        });
        post({ type: 'readPdfPlace', tab, fingerprint, request });
      }),
    onPlace: (fingerprint, place) => {
      pending.current = { fingerprint, place };
      timer.current ??= setTimeout(flush, placeEvery);
    },
    onFound: setFound,
    onShown: (opened) => {
      shown.current = opened;
      if (opened === undefined) {
        flush();
      }
    },
  };

  return {
    controls,
    find: {
      query,
      count: pdfFindCount(query, found),
      matches: found?.total ?? 0,
      search: (next: string) => {
        setQuery(next);
        setFound(undefined);
        shown.current?.find(next, 0);
      },
      step: (by: 1 | -1) => shown.current?.find(query, by),
    },
  };
}
