import { useEffect, useRef, useState } from 'react';
import type { PdfPlace } from '../shared/pdf';
import type { MatchesFound } from '../../../lib/shared/textMatches';
import {
  noSearch,
  type Search,
  type SearchOptions,
} from '../../../lib/shared/searchOptions';
import type { ShownPdf } from './pdfDocument';
import type { PdfFound } from './pdfFinds';
import { KeptMatch } from './pdfMatch';
import { useViewer, useViewerActions } from './store';

export function pdfFound(found: PdfFound | undefined): MatchesFound {
  return {
    current: Math.max(0, (found?.current ?? 0) - 1),
    matches: found?.total ?? 0,
    searching: found === undefined || !found.done,
  };
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
    useViewerActions();
  const { query, options } = useViewer((state) =>
    tab === undefined
      ? noSearch
      : (state.tabViews.get(tab)?.pdfFind?.search ?? noSearch),
  );
  const [found, setFound] = useState<PdfFound>();
  const [match] = useState(() => new KeptMatch(undefined));
  useEffect(() => flushPdfPlace, [flushPdfPlace]);
  const current = found?.current ?? 0;
  useEffect(() => {
    if (tab !== undefined) {
      match.seek(keptViewer(tab).pdfFind?.current);
    }
  }, [match, tab, keptViewer]);
  useEffect(() => {
    if (tab !== undefined) {
      keepViewer(tab, {
        pdfFind: {
          search: { query, options },
          current: match.kept ?? current,
        },
      });
    }
  }, [tab, keepViewer, query, options, current, match]);

  const searchFor = (next: Search) => {
    match.drop();
    if (tab !== undefined) {
      keepViewer(tab, { pdfFind: { search: next, current: 0 } });
    }
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
      match.found(next, (by) => shown.current?.find(query, options, by));
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
