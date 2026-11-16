import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { ByteRange } from '../shared/protocol';
import type { TextEncoding } from '../../../components/encodings/shared/textEncodings';
import { stepMatch, type MatchesFound } from '../../../lib/shared/textMatches';
import {
  noSearch,
  type Search,
  type SearchOptions,
} from '../../../lib/shared/searchOptions';
import type { Viewing } from './viewing';
import { useViewer, useViewerActions } from './store';
import { noKeptViewer, type ViewerFound } from './viewerKept';

export interface ViewerFind {
  readonly query: string;
  readonly options: SearchOptions;
  readonly matches: readonly ByteRange[];
  readonly current: ByteRange | undefined;
  readonly jump: number;
}

export function viewerFound(
  found: number,
  current: number,
  done: boolean,
): MatchesFound {
  return { current, matches: found, searching: !done };
}

function foundFor(
  found: ViewerFound | undefined,
  { query, options }: Search,
  encoding: TextEncoding,
  version: string | undefined,
): found is ViewerFound {
  return (
    found?.query === query &&
    found.options === options &&
    found.encoding === encoding &&
    found.version === version
  );
}

export function useViewerFind(
  tab: string | undefined,
  viewing: Viewing | undefined,
  encoding: TextEncoding,
) {
  const { findText, keptViewer, keepViewer } = useViewerActions();
  const [kept] = useState(() =>
    tab === undefined ? noKeptViewer : keptViewer(tab),
  );
  const { query, options } = useViewer((state) =>
    tab === undefined
      ? noSearch
      : (state.tabViews.get(tab)?.search ?? noSearch),
  );
  const current = useViewer((state) =>
    tab === undefined ? 0 : (state.tabViews.get(tab)?.current ?? 0),
  );
  const [found, setFound] = useState(kept.found);
  const [jump, setJump] = useState(0);
  const awaitingFirst = useRef(false);
  const version = viewing?.version;
  const foundAlready = useEffectEvent(
    () => foundFor(found, { query, options }, encoding, version) && found.done,
  );

  useEffect(() => {
    if (viewing?.size === undefined || query === '' || foundAlready()) {
      return undefined;
    }
    const searched = viewing.version;
    return findText(
      viewing.tab,
      encoding,
      query,
      options,
      ({ matches, done }) => {
        setFound({
          query,
          options,
          encoding,
          version: searched,
          matches,
          done,
        });
        if (awaitingFirst.current && matches.length > 0) {
          awaitingFirst.current = false;
          setJump((count) => count + 1);
        }
      },
    );
  }, [viewing, encoding, query, options, findText]);

  useEffect(() => {
    if (tab !== undefined) {
      keepViewer(tab, { found });
    }
  }, [tab, keepViewer, found]);

  const ours = foundFor(found, { query, options }, encoding, version);
  const matches = ours ? found.matches : [];
  const shown = Math.min(current, Math.max(0, matches.length - 1));
  const goTo = (index: number) => {
    if (tab !== undefined) {
      keepViewer(tab, { current: index });
    }
    setJump((count) => count + 1);
  };
  const searchFor = (next: Search) => {
    if (tab !== undefined) {
      keepViewer(tab, { search: next, current: 0 });
    }
    awaitingFirst.current = true;
  };

  return {
    query,
    options,
    matches,
    found: viewerFound(matches.length, shown, ours && found.done),
    find: {
      query,
      options,
      matches,
      current: matches[shown],
      jump,
    },
    search: (next: string) => searchFor({ query: next, options }),
    choose: (next: SearchOptions) => searchFor({ query, options: next }),
    step: (by: 1 | -1) => goTo(stepMatch(shown, matches.length, by)),
  };
}

export interface ViewerSearch {
  readonly query: string;
  readonly options: SearchOptions;
  readonly found: MatchesFound;
  readonly search: (query: string) => void;
  readonly choose: (options: SearchOptions) => void;
  readonly step: (by: 1 | -1) => void;
}
