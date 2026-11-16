import { useEffect, useRef, useState } from 'react';
import type { KeptPdfFind } from './viewerKept';
import type { PdfPlace } from '../shared/pdf';
import type { MatchesFound } from '../../../lib/shared/textMatches';
import {
  noSearch,
  type Search,
  type SearchOptions,
} from '../../../lib/shared/searchOptions';
import type { PdfFound, ShownPdf } from './pdfDocument';
import { useCommanderActions } from './store';

export function pdfFound(found: PdfFound | undefined): MatchesFound {
  return {
    current: Math.max(0, (found?.current ?? 0) - 1),
    matches: found?.total ?? 0,
    searching: found === undefined || !found.done,
  };
}

export function stepToKept(
  found: PdfFound,
  wanted: number | undefined,
): -1 | 1 | undefined {
  if (
    wanted === undefined ||
    found.current === 0 ||
    found.current === wanted ||
    wanted > found.total
  ) {
    return undefined;
  }
  return wanted > found.current ? 1 : -1;
}

export function keptPdfFound(
  found: PdfFound,
  wanted: number | undefined,
): number | undefined {
  return wanted === undefined ||
    found.current === wanted ||
    (found.done && wanted > found.total)
    ? undefined
    : wanted;
}

export interface PdfControls {
  readonly query: string;
  readonly options: SearchOptions;
  readonly placeOf: (fingerprint: string) => Promise<PdfPlace | undefined>;
  readonly onPlace: (fingerprint: string, place: PdfPlace) => void;
  readonly onFound: (found: PdfFound) => void;
  readonly onShown: (shown: ShownPdf | undefined) => void;
}

export function usePdfPreview(tab: string | undefined) {
  const shown = useRef<ShownPdf>(undefined);
  const { readPdfPlace, keepPdfPlace, flushPdfPlace, keptViewer, keepViewer } =
    useCommanderActions();
  const [kept] = useState<KeptPdfFind | undefined>(() =>
    tab === undefined ? undefined : keptViewer(tab).pdfFind,
  );
  const [{ query, options }, setSearch] = useState(kept?.search ?? noSearch);
  const [found, setFound] = useState<PdfFound>();
  const wanted = useRef(kept?.current);
  useEffect(() => flushPdfPlace, [flushPdfPlace]);
  const current = found?.current ?? 0;
  useEffect(() => {
    if (tab !== undefined) {
      keepViewer(tab, {
        pdfFind: {
          search: { query, options },
          current: wanted.current ?? current,
        },
      });
    }
  }, [tab, keepViewer, query, options, current]);

  const searchFor = (next: Search) => {
    wanted.current = undefined;
    setSearch(next);
    setFound(undefined);
    if (next.query === '') {
      shown.current?.closeFind();
    } else {
      shown.current?.find(next.query, next.options, 0);
    }
  };

  const controls: PdfControls = {
    query,
    options,
    placeOf: (fingerprint) =>
      tab === undefined
        ? Promise.resolve(undefined)
        : readPdfPlace(tab, fingerprint),
    onPlace: (fingerprint, place) => {
      if (tab !== undefined) {
        keepPdfPlace(tab, fingerprint, place);
      }
    },
    onFound: (next) => {
      setFound(next);
      const step = stepToKept(next, wanted.current);
      wanted.current = keptPdfFound(next, wanted.current);
      if (step !== undefined) {
        shown.current?.find(query, options, step);
      }
    },
    onShown: (opened) => {
      shown.current = opened;
      if (opened === undefined) {
        flushPdfPlace();
      }
    },
  };

  return {
    controls,
    find: {
      query,
      options,
      found: pdfFound(found),
      search: (next: string) => searchFor({ query: next, options }),
      choose: (next: SearchOptions) => searchFor({ query, options: next }),
      step: (by: 1 | -1) => shown.current?.find(query, options, by),
    },
  };
}
