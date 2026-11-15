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
import type { WholeFile } from './diffRows';
import { findMatches, type FindMatch } from './find';
import { stepMatch } from '../../../lib/shared/textMatches';
import type { SearchOptions } from '../../../lib/shared/searchOptions';
import { diffFindOf } from './gitSelectors';
import { useGit, useGitActions } from './store';

export function useDiffFind({
  scope,
  selection,
  diffFiles,
  fileContent,
  findAsked,
}: {
  readonly scope: string;
  readonly selection: string;
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
  const kept = useGit(diffFindOf(scope));
  const { keepDiffFind, closeDiffFind, diffPlaceOf, keepDiffPlace } =
    useGitActions();
  const { finding } = kept;
  const { query, options } = kept.search;
  const setQuery = (next: string) =>
    keepDiffFind(scope, { finding, search: { query: next, options } });
  const setOptions = (next: SearchOptions) =>
    keepDiffFind(scope, { finding, search: { query, options: next } });
  const shownAt = JSON.stringify([scope, selection]);
  const place = diffPlaceOf(scope, selection);
  const [at, setAt] = useState({
    shownAt,
    current: place?.current ?? 0,
    placed: place !== undefined,
  });
  const [jump, setJump] = useState(0);
  if (at.shownAt !== shownAt) {
    setAt({
      shownAt,
      current: place?.current ?? 0,
      placed: place !== undefined,
    });
    if (place === undefined) {
      setJump((count) => count + 1);
    }
  }
  const input = useRef<HTMLInputElement>(null);
  const matches = useMemo(
    () => findMatches(diffFiles, fileContent, query, options),
    [diffFiles, fileContent, query, options],
  );
  const shown = Math.min(at.current, Math.max(0, matches.length - 1));
  const goTo = (index: number) => {
    setAt({ shownAt, current: index, placed: at.placed });
    keepDiffPlace(scope, selection, { current: index });
    setJump((count) => count + 1);
  };
  const step = (by: 1 | -1) => goTo(stepMatch(shown, matches.length, by));
  const [focusAsks, setFocusAsks] = useState(0);
  const openFind = () => {
    keepDiffFind(scope, { finding: true, search: kept.search });
    setFocusAsks((count) => count + 1);
  };
  const closeFind = () => {
    columnFocusOf(input.current)?.focus();
    closeDiffFind(scope);
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
    placed: at.placed,
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
