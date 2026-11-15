import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { columnFocusOf } from '../../../lib/page/columnFocus';
import type { DiffFile } from './diff';
import type { WholeFile } from './diffRows';
import { findMatches, type FindMatch } from './find';
import { stepMatch } from '../../../lib/shared/textMatches';

export function useDiffFind({
  diffFiles,
  fileContent,
  findAsked,
}: {
  readonly diffFiles: readonly DiffFile[];
  readonly fileContent: WholeFile | undefined;
  readonly findAsked: number;
}): {
  readonly query: string;
  readonly setQuery: (query: string) => void;
  readonly setCurrent: (current: number) => void;
  readonly jump: number;
  readonly setJump: (jump: (count: number) => number) => void;
  readonly input: RefObject<HTMLInputElement | null>;
  readonly matches: readonly FindMatch[];
  readonly shown: number;
  readonly goTo: (index: number) => void;
  readonly step: (by: 1 | -1) => void;
  readonly finding: boolean;
  readonly openFind: () => void;
  readonly closeFind: () => void;
} {
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState(0);
  const [jump, setJump] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const matches = useMemo(
    () => findMatches(diffFiles, fileContent, query),
    [diffFiles, fileContent, query],
  );
  const shown = Math.min(current, Math.max(0, matches.length - 1));
  const goTo = (index: number) => {
    setCurrent(index);
    setJump((count) => count + 1);
  };
  const step = (by: 1 | -1) => goTo(stepMatch(shown, matches.length, by));
  const [finding, setFinding] = useState(false);
  const [focusAsks, setFocusAsks] = useState(0);
  const openFind = () => {
    setFinding(true);
    setFocusAsks((count) => count + 1);
  };
  const closeFind = () => {
    columnFocusOf(input.current)?.focus();
    setFinding(false);
    setQuery('');
  };
  const [findSeen, setFindSeen] = useState(findAsked);
  if (findSeen !== findAsked) {
    setFindSeen(findAsked);
    openFind();
  }
  useEffect(() => {
    if (focusAsks > 0) {
      input.current?.focus();
      input.current?.select();
    }
  }, [focusAsks]);
  return {
    query,
    setQuery,
    setCurrent,
    jump,
    setJump,
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
