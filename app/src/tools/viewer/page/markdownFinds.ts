import { useState } from 'react';
import {
  noSearch,
  type Search,
  type SearchOptions,
} from '../../../lib/shared/searchOptions';
import { stepMatch } from '../../../lib/shared/textMatches';
import { useViewer, useViewerActions } from './store';
import type { ViewerSearch } from './find';

export interface MarkdownFindControls {
  readonly query: string;
  readonly options: SearchOptions;
  readonly current: number;
  readonly jump: number;
  readonly onFound: (count: number) => void;
}

export function useMarkdownFind(tab: string | undefined): {
  readonly controls: MarkdownFindControls;
  readonly find: ViewerSearch;
} {
  const { keepViewer } = useViewerActions();
  const kept = useViewer((state) =>
    tab === undefined ? undefined : state.tabViews.get(tab)?.markdownFind,
  );
  const { query, options } = kept?.search ?? noSearch;
  const current = kept?.current ?? 0;
  const [count, setCount] = useState<number>();
  const [jump, setJump] = useState(0);
  const keep = (search: Search, at: number) => {
    if (tab !== undefined) {
      keepViewer(tab, { markdownFind: { search, current: at } });
    }
  };
  const searchFor = (next: Search) => {
    keep(next, 0);
    setCount(undefined);
    setJump((made) => made + 1);
  };
  const matches = count ?? 0;
  return {
    controls: {
      query,
      options,
      current,
      jump,
      onFound: (found) => {
        setCount(found);
        if (current > 0 && current >= found) {
          keep({ query, options }, 0);
        }
      },
    },
    find: {
      query,
      options,
      found: {
        current: Math.min(current, Math.max(0, matches - 1)),
        matches,
        searching: query !== '' && count === undefined,
      },
      search: (next) => searchFor({ query: next, options }),
      choose: (next) => searchFor({ query, options: next }),
      step: (by) => {
        if (matches > 0) {
          keep({ query, options }, stepMatch(current, matches, by));
          setJump((made) => made + 1);
        }
      },
    },
  };
}
