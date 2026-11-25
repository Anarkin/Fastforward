import { useEffect, useMemo, useRef, useState } from 'react';
import { columnFocusOf } from '../../../lib/page/columnFocus';
import {
  plainSearch,
  sameSearchOptions,
} from '../../../lib/shared/searchOptions';
import type { CommitInfo } from '../shared/protocol';
import { filteredHistory, filterLimit } from './commitFilter';
import type { CommitHistory } from './commitHistory';
import { useCommitSurroundings } from './crowdedBubbles';
import { foundCommits, hashQuery, textQuery } from './locationQuery';
import { commitFilterOf } from './selectors';
import { useGit, useGitActions } from './store';

const noCommits: readonly CommitInfo[] = [];

const noSearch = { commits: noCommits, capped: false };

export function useCommitFilter(asked: number) {
  const filter = useGit(commitFilterOf);
  const lookup = useGit((state) => state.tab.hashLookup);
  const searched = useGit((state) => state.tab.commitSearch);
  const around = useCommitSurroundings();
  const { filterCommits, lookupHash, searchCommits } = useGitActions();
  const query = filter?.query ?? '';
  const options = filter?.options ?? plainSearch;
  const hash = filter === undefined ? undefined : hashQuery(query);
  const text = filter === undefined ? undefined : textQuery(query);
  useEffect(() => {
    if (!hash) {
      return undefined;
    }
    return lookupHash(hash);
  }, [hash, lookupHash]);
  useEffect(() => {
    if (!text) {
      return undefined;
    }
    return searchCommits(text, options, filterLimit);
  }, [text, options, searchCommits]);
  const byHash = useMemo(
    () =>
      hash === undefined
        ? noCommits
        : lookup?.query === hash
          ? lookup.result.commits
          : undefined,
    [hash, lookup],
  );
  const byText = useMemo(
    () =>
      text === undefined
        ? noSearch
        : searched?.query === text &&
            searched.limit === filterLimit &&
            sameSearchOptions(searched.options, options)
          ? searched.result
          : undefined,
    [text, searched, options],
  );
  const narrowing = hash !== undefined || text !== undefined;
  const settled = byHash !== undefined && byText !== undefined;
  const found = useMemo(
    () =>
      narrowing && byHash !== undefined && byText !== undefined
        ? foundCommits(byHash, byText.commits)
        : undefined,
    [narrowing, byHash, byText],
  );
  const [kept, setKept] = useState<readonly CommitInfo[]>();
  useEffect(() => {
    if (found !== undefined) {
      setKept(found);
    }
  }, [found]);
  const listed = narrowing ? (found ?? kept) : undefined;
  const history = useMemo<CommitHistory | undefined>(
    () => listed && filteredHistory(listed, around),
    [listed, around],
  );
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (asked > 0) {
      input.current?.focus();
      input.current?.select();
    }
  }, [asked]);
  return {
    filter,
    history,
    found: listed,
    searching: narrowing && !settled,
    capped: byText?.capped === true,
    input,
    toList: () => columnFocusOf(input.current)?.focus(),
    close: () => {
      columnFocusOf(input.current)?.focus();
      filterCommits(undefined);
    },
    onQuery: (next: string) => filterCommits(next),
    onOptions: (next: typeof options) => filterCommits(query, next),
  };
}
