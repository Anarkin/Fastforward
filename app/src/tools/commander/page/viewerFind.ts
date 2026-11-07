import { useEffect, useRef, useState } from 'react';
import type { ByteRange, TextEncoding } from '../shared/protocol';
import { strings } from '../../../shared/strings';
import { matchCount, stepMatch } from '../../../shared/textMatches';
import type { Viewing } from './viewer';
import { useCommanderActions } from './store';

export interface ViewerFind {
  readonly query: string;
  readonly matches: readonly ByteRange[];
  readonly current: ByteRange | undefined;
  readonly jump: number;
}

interface Found {
  readonly query: string;
  readonly encoding: TextEncoding;
  readonly matches: readonly ByteRange[];
  readonly done: boolean;
}

export function findCount(
  query: string,
  found: number,
  current: number,
  done: boolean,
): string {
  return query !== '' && found === 0 && !done
    ? strings.find.searching
    : matchCount(query, found, current);
}

export function useViewerFind(
  viewing: Viewing | undefined,
  encoding: TextEncoding,
) {
  const { findText } = useCommanderActions();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Found>();
  const [current, setCurrent] = useState(0);
  const [jump, setJump] = useState(0);
  const awaitingFirst = useRef(false);

  useEffect(() => {
    if (viewing?.size === undefined || query === '') {
      return undefined;
    }
    return findText(viewing.tab, encoding, query, ({ matches, done }) => {
      setFound({ query, encoding, matches, done });
      if (awaitingFirst.current && matches.length > 0) {
        awaitingFirst.current = false;
        setJump((count) => count + 1);
      }
    });
  }, [viewing, encoding, query, findText]);

  const ours = found?.query === query && found.encoding === encoding;
  const matches = ours ? found.matches : [];
  const shown = Math.min(current, Math.max(0, matches.length - 1));
  const goTo = (index: number) => {
    setCurrent(index);
    setJump((count) => count + 1);
  };

  return {
    query,
    matches,
    count: findCount(query, matches.length, shown, ours && found.done),
    find: { query, matches, current: matches[shown], jump },
    search: (next: string) => {
      setQuery(next);
      setCurrent(0);
      awaitingFirst.current = true;
    },
    step: (by: 1 | -1) => goTo(stepMatch(shown, matches.length, by)),
  };
}
