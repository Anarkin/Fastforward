import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { columnFocusOf } from '../../../lib/page/columnFocus';
import type { DiffFile } from './diff';
import type { WholeFile } from './rows';
import { findMatches, type FindMatch } from './find';
import { stepMatch } from '../../../lib/shared/textMatches';
import type { SearchOptions } from '../../../lib/shared/searchOptions';
import { currentOf, type DiffPlace } from './place';
import type { KeptFind, PlaceChange } from './slice';

export interface DiffTab {
  readonly find: KeptFind;
  readonly keepFind: (find: KeptFind) => void;
  readonly closeFind: () => void;
  readonly place: DiffPlace | undefined;
  readonly placeNow: () => DiffPlace | undefined;
  readonly keepPlace: (change: PlaceChange) => void;
}

export function useDiffFind({
  shownAt,
  tab,
  diffFiles,
  fileContent,
  findAsked,
}: {
  readonly shownAt: string;
  readonly tab: DiffTab;
  readonly diffFiles: readonly DiffFile[];
  readonly fileContent: WholeFile | undefined;
  readonly findAsked: number;
}): {
  readonly query: string;
  readonly options: SearchOptions;
  readonly setQuery: (query: string) => void;
  readonly setOptions: (options: SearchOptions) => void;
  readonly jump: number;
  readonly placed: boolean;
  readonly input: RefObject<HTMLInputElement | null>;
  readonly matches: readonly FindMatch[];
  readonly shown: number;
  readonly goTo: (index: number) => void;
  readonly step: (by: 1 | -1) => void;
  readonly finding: boolean;
  readonly openFind: () => void;
  readonly closeFind: () => void;
} {
  const { find: kept, keepFind, closeFind: closeKept, place, keepPlace } = tab;
  const { finding } = kept;
  const { query, options } = kept.search;
  const setQuery = (next: string) =>
    keepFind({ finding, search: { query: next, options } });
  const setOptions = (next: SearchOptions) =>
    keepFind({ finding, search: { query, options: next } });
  const [shownFor, setShownFor] = useState({
    shownAt,
    placed: place !== undefined,
  });
  const [jump, setJump] = useState(0);
  if (shownFor.shownAt !== shownAt) {
    setShownFor({ shownAt, placed: place !== undefined });
    if (place === undefined) {
      setJump((count) => count + 1);
    }
  }
  const input = useRef<HTMLInputElement>(null);
  const matches = useMemo(
    () => findMatches(diffFiles, fileContent, query, options),
    [diffFiles, fileContent, query, options],
  );
  const shown = Math.min(
    currentOf(place, kept.search),
    Math.max(0, matches.length - 1),
  );
  const goTo = (index: number) => {
    keepPlace({ current: index });
    setJump((count) => count + 1);
  };
  const step = (by: 1 | -1) => goTo(stepMatch(shown, matches.length, by));
  const [focusAsks, setFocusAsks] = useState(0);
  const openFind = () => {
    keepFind({ finding: true, search: kept.search });
    setFocusAsks((count) => count + 1);
  };
  const closeFind = () => {
    columnFocusOf(input.current)?.focus();
    closeKept();
  };
  const asked = useEffectEvent(openFind);
  const findSeen = useRef(findAsked);
  useEffect(() => {
    if (findSeen.current !== findAsked) {
      findSeen.current = findAsked;
      asked();
    }
  }, [findAsked]);
  useEffect(() => {
    if (focusAsks > 0) {
      input.current?.focus();
      input.current?.select();
    }
  }, [focusAsks]);
  return {
    query,
    options,
    setQuery,
    setOptions,
    jump,
    placed: shownFor.placed,
    input,
    matches,
    shown,
    goTo,
    step,
    finding,
    openFind,
    closeFind,
  };
}
