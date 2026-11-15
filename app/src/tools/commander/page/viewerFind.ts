import { useEffect, useRef, useState } from 'react';
import type { ByteRange } from '../shared/protocol';
import type { TextEncoding } from '../shared/textEncodings';
import { stepMatch, type MatchesFound } from '../../../lib/shared/textMatches';
import {
  noSearch,
  type Search,
  type SearchOptions,
} from '../../../lib/shared/searchOptions';
import type { Viewing } from './commanderState';
import { useCommanderActions } from './store';

export interface ViewerFind {
  readonly query: string;
  readonly options: SearchOptions;
  readonly matches: readonly ByteRange[];
  readonly current: ByteRange | undefined;
  readonly jump: number;
}

interface Found {
  readonly query: string;
  readonly options: SearchOptions;
  readonly encoding: TextEncoding;
  readonly matches: readonly ByteRange[];
  readonly done: boolean;
}

export function viewerFound(
  found: number,
  current: number,
  done: boolean,
): MatchesFound {
  return { current, matches: found, searching: !done };
}

export function useViewerFind(
  viewing: Viewing | undefined,
  encoding: TextEncoding,
) {
  const { findText } = useCommanderActions();
  const [{ query, options }, setSearch] = useState(noSearch);
  const [found, setFound] = useState<Found>();
  const [current, setCurrent] = useState(0);
  const [jump, setJump] = useState(0);
  const awaitingFirst = useRef(false);

  useEffect(() => {
    if (viewing?.size === undefined || query === '') {
      return undefined;
    }
    return findText(
      viewing.tab,
      encoding,
      query,
      options,
      ({ matches, done }) => {
        setFound({ query, options, encoding, matches, done });
        if (awaitingFirst.current && matches.length > 0) {
          awaitingFirst.current = false;
          setJump((count) => count + 1);
        }
      },
    );
  }, [viewing, encoding, query, options, findText]);

  const ours =
    found?.query === query &&
    found.options === options &&
    found.encoding === encoding;
  const matches = ours ? found.matches : [];
  const shown = Math.min(current, Math.max(0, matches.length - 1));
  const goTo = (index: number) => {
    setCurrent(index);
    setJump((count) => count + 1);
  };
  const searchFor = (next: Search) => {
    setSearch(next);
    setCurrent(0);
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
