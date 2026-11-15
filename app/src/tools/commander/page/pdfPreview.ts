import { useEffect, useRef, useState } from 'react';
import type { PdfPlace } from '../shared/pdf';
import { matchCount } from '../../../lib/shared/textMatches';
import {
  plainSearch,
  type SearchOptions,
} from '../../../lib/shared/searchOptions';
import type { PdfFound, ShownPdf } from './pdfDocument';
import { useCommanderActions } from './store';

export function pdfFindCount(
  query: string,
  options: SearchOptions,
  found: PdfFound | undefined,
): string {
  return matchCount(query, options, {
    current: Math.max(0, (found?.current ?? 0) - 1),
    matches: found?.total ?? 0,
    searching: found === undefined || !found.done,
  });
}

export interface PdfControls {
  readonly query: string;
  readonly placeOf: (fingerprint: string) => Promise<PdfPlace | undefined>;
  readonly onPlace: (fingerprint: string, place: PdfPlace) => void;
  readonly onFound: (found: PdfFound) => void;
  readonly onShown: (shown: ShownPdf | undefined) => void;
}

export function usePdfPreview(tab: string | undefined) {
  const shown = useRef<ShownPdf>(undefined);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<PdfFound>();
  const { readPdfPlace, keepPdfPlace, flushPdfPlace } = useCommanderActions();
  useEffect(() => flushPdfPlace, [flushPdfPlace]);

  const controls: PdfControls = {
    query,
    placeOf: (fingerprint) =>
      tab === undefined
        ? Promise.resolve(undefined)
        : readPdfPlace(tab, fingerprint),
    onPlace: (fingerprint, place) => {
      if (tab !== undefined) {
        keepPdfPlace(tab, fingerprint, place);
      }
    },
    onFound: setFound,
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
      count: pdfFindCount(query, plainSearch, found),
      matches: found?.total ?? 0,
      search: (next: string) => {
        setQuery(next);
        setFound(undefined);
        if (next === '') {
          shown.current?.closeFind();
        } else {
          shown.current?.find(next, 0);
        }
      },
      step: (by: 1 | -1) => shown.current?.find(query, by),
    },
  };
}
