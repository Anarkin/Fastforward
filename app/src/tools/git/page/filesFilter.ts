import type { Filter } from '../../../lib/shared/filter';
import type { Search } from '../../../lib/shared/searchOptions';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { columnFocusOf } from '../../../lib/page/columnFocus';

export const noneClosed: ReadonlySet<string> = new Set();

export function useFilesFilter({
  view,
  words,
  filter,
  onFilter,
  filterAsked,
}: {
  readonly view: string;
  readonly words: Filter;
  readonly filter: Search | undefined;
  readonly onFilter: (filter: string | undefined) => void;
  readonly filterAsked: number;
}): {
  readonly closedWhileFiltering: ReadonlySet<string>;
  readonly foldWhileFiltering: (closed: ReadonlySet<string>) => void;
  readonly input: RefObject<HTMLInputElement | null>;
  readonly toList: () => void;
  readonly closeFilter: () => void;
  readonly openFilter: () => void;
} {
  const searched = JSON.stringify(words);
  const [folds, setFolds] = useState({ view, searched, closed: noneClosed });
  const closedWhileFiltering =
    folds.view === view && folds.searched === searched
      ? folds.closed
      : noneClosed;
  const foldWhileFiltering = (closed: ReadonlySet<string>) =>
    setFolds({ view, searched, closed });
  const input = useRef<HTMLInputElement>(null);
  const [clicked, setClicked] = useState(0);
  useEffect(() => {
    if (filterAsked + clicked > 0) {
      input.current?.focus();
      input.current?.select();
    }
  }, [filterAsked, clicked]);
  const toList = () => columnFocusOf(input.current)?.focus();
  const closeFilter = () => {
    toList();
    onFilter(undefined);
  };
  const openFilter = () => {
    onFilter(filter?.query ?? '');
    setClicked((count) => count + 1);
  };
  return {
    closedWhileFiltering,
    foldWhileFiltering,
    input,
    toList,
    closeFilter,
    openFilter,
  };
}
