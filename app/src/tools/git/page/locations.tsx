import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import { searchedBookmarks } from './bookmarks';
import { columnFocusOf } from '../../../lib/page/columnFocus';
import { useDismiss } from '../../../lib/page/dismiss';
import { noRefs } from './commitListItems';
import { locationsOf, locationsScrollOf, searchOf } from './gitSelectors';
import { useRestore } from '../../../lib/page/restore';
import { useGit, useGitActions } from './store';
import { strings } from '../../../lib/shared/strings';
import { searchFilter } from '../../../lib/shared/filter';
import { sameSearchOptions } from '../../../lib/shared/searchOptions';
import { stepMatch } from '../../../lib/shared/textMatches';
import { SearchBar } from '../../../lib/page/searchBar';
import {
  searchRefs,
  noStashList,
  searchStashes,
  shownStashes,
  pinnedResults,
  resultItems,
  itemKey,
} from './locationResults';
import { browseRows, Rows } from './locationRows';
import { Highlighted, currentActive, nextActive } from './locationHighlight';
import { RefTree } from './locationTree';
import {
  keptOpenBy,
  focusLeaves,
  locationRows,
  popupKeyAction,
} from './locationKeys';
import { useShell } from '../../../shell/page/store';
import { useWholeRows } from '../../../lib/page/wholeRows';
import {
  foundCommits,
  hashQuery,
  textQuery,
  enterTarget,
} from './locationQuery';
import { usePopupHeight } from './popupHeight';
import { searchFocusName } from './worktreeSearch';
import {
  BookmarksSection,
  CommitResultsSection,
  GroupHeading,
  SearchResults,
  StashesSection,
} from './locationGroups';

const locationsWithin = 10_000;
const noneToggled: ReadonlySet<string> = new Set();

export function LocationsPopup({
  anchor,
}: {
  anchor: React.RefObject<HTMLElement | null>;
}) {
  const { query, options } = useGit(searchOf);
  const bookmarks = useGit((state) => state.bookmarks);
  const refs = useGit((state) => state.tab.repository?.refs ?? noRefs);
  const stashes = useGit(
    (state) => state.tab.repository?.stashes ?? noStashList,
  );
  const lookup = useGit((state) => state.tab.hashLookup);
  const commitSearch = useGit((state) => state.tab.commitSearch);
  const {
    lookupHash: onLookup,
    searchCommits: onSearchCommits,
    jump: onJump,
    search: openSearch,
    searchFor: onQuery,
    keepLocations,
    keepLocationsScroll,
  } = useGitActions();
  const onClose = useCallback(() => openSearch(false), [openSearch]);
  const popup = useRef<HTMLDivElement>(null);
  const groups = useRef<HTMLDivElement>(null);
  const height = usePopupHeight(popup);
  const scrolling = useShell((state) => state.scrolling);
  useWholeRows(groups, locationRows, scrolling);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.select(), []);
  useEffect(
    () => () => {
      if (document.activeElement === document.body) {
        columnFocusOf(anchor.current)?.focus();
      }
    },
    [anchor],
  );
  const index = useGit((state) => state.refIndex);
  const filter = useMemo(() => searchFilter(query, options), [query, options]);
  const search = useMemo(() => searchRefs(index, filter), [index, filter]);
  const stashSearch = useMemo(
    () => searchStashes(stashes, filter),
    [stashes, filter],
  );
  const drawnStashes = useMemo(
    () => shownStashes(stashes, filter),
    [stashes, filter],
  );
  const hasQuery = query.trim() !== '';
  const pinned = useMemo(
    () => searchedBookmarks(bookmarks, refs, filter),
    [bookmarks, refs, filter],
  );
  const pinnedItems = useMemo(
    () => pinnedResults(pinned, refs),
    [pinned, refs],
  );
  const hash = hashQuery(query);
  useEffect(() => {
    if (!hash) {
      return undefined;
    }
    return onLookup(hash);
  }, [hash, onLookup]);
  const found = hash && lookup?.query === hash ? lookup.result : undefined;
  const text = textQuery(query);
  useEffect(() => {
    if (!text) {
      return undefined;
    }
    return onSearchCommits(text, options);
  }, [text, options, onSearchCommits]);
  const textFound =
    text &&
    commitSearch?.query === text &&
    sameSearchOptions(commitSearch.options, options)
      ? commitSearch.result
      : undefined;
  const commits = useMemo(
    () => foundCommits(found?.commits ?? [], textFound?.commits ?? []),
    [found, textFound],
  );
  const lookingUp = hash !== undefined && found === undefined;
  const searching = text !== undefined && textFound === undefined;
  const items = useMemo(
    () => resultItems(commits, search, stashSearch, pinnedItems),
    [commits, search, stashSearch, pinnedItems],
  );
  const kept = useGit(locationsOf);
  const highlight = kept?.highlight;
  const toggled = kept?.toggled ?? noneToggled;
  const setHighlight = (next: Highlighted) =>
    keepLocations({ highlight: next, toggled });
  const setToggled = (next: ReadonlySet<string>) =>
    keepLocations({ highlight, toggled: next });
  const browsed = hasQuery
    ? []
    : browseRows(pinnedItems, index, toggled, drawnStashes.stashes);
  const active = hasQuery
    ? currentActive(items, query, highlight)
    : highlight?.query === query
      ? browsed.findIndex((row) => row.key === highlight.key)
      : -1;
  const activeItem = hasQuery ? items.at(active) : undefined;
  const activeRow = active === -1 ? undefined : browsed.at(active);
  const activeKey = activeItem ? itemKey(activeItem) : activeRow?.key;
  const baseId = useId();
  const resultsId = `${baseId}results`;
  const rows: Rows = {
    tree: !hasQuery,
    id: (key) => `${baseId}${key}`,
    active: activeKey,
    toggled,
    onToggle: (key) => {
      const next = new Set(toggled);
      if (!next.delete(key)) {
        next.add(key);
      }
      setToggled(next);
    },
  };
  const activeId = activeKey === undefined ? undefined : rows.id(activeKey);
  const scrolledTo = useGit(locationsScrollOf);
  const restoring = useRestore(
    scrolledTo,
    (top) => {
      const element = groups.current;
      return (
        element !== null && element.scrollHeight - element.clientHeight >= top
      );
    },
    (top) => {
      if (groups.current !== null) {
        groups.current.scrollTop = top;
      }
    },
    {
      key: groups,
      on: groups,
      watch: groups,
      within: locationsWithin,
      beforePaint: true,
    },
  );
  const revealed = useRef(scrolledTo === undefined ? undefined : activeId);
  useEffect(() => {
    const element = groups.current;
    if (element === null) {
      return undefined;
    }
    const scrolled = () => {
      if (restoring.current === undefined) {
        keepLocationsScroll(element.scrollTop);
      }
    };
    element.addEventListener('scroll', scrolled, { passive: true });
    return () => element.removeEventListener('scroll', scrolled);
  }, [keepLocationsScroll, restoring]);
  useEffect(() => {
    if (activeId !== undefined && activeId !== revealed.current) {
      popup.current?.ownerDocument
        .getElementById(activeId)
        ?.scrollIntoView({ block: 'nearest' });
    }
    revealed.current = undefined;
  }, [activeId, popup, revealed]);

  const jump = (target: string | undefined) => {
    if (target) {
      onJump(target);
      onClose();
    }
  };

  useDismiss(anchor, onClose, { ignore: keptOpenBy });

  const keys = hasQuery ? items.map(itemKey) : browsed.map((row) => row.key);
  const stepTo = (at: number) => {
    const next = keys.at(at);
    if (next) {
      setHighlight({ query, key: next });
    }
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    const action = popupKeyAction(event.nativeEvent);
    if (typeof action === 'number') {
      event.preventDefault();
      stepTo(nextActive(keys, active, action));
    } else if (action === 'enter') {
      event.preventDefault();
      if (activeRow?.kind === 'folder') {
        rows.onToggle(activeRow.key);
      } else if (activeRow) {
        jump(activeRow.commit);
      } else {
        jump(enterTarget(query, found, activeItem, highlight?.query === query));
      }
    }
  };

  return (
    <div
      className="locations-popup"
      ref={popup}
      style={{ height }}
      onKeyDown={onKeyDown}
      onMouseDown={(event) => {
        if (event.target !== input.current) {
          event.preventDefault();
        }
      }}
      onBlur={(event) => {
        if (focusLeaves(anchor.current, event.relatedTarget)) {
          onClose();
        }
      }}
    >
      <div className="locations-bar">
        <SearchBar
          font="proportional"
          query={query}
          options={options}
          found={{
            current: active,
            matches: keys.length,
            capped:
              hasQuery &&
              (search.some((group) => group.more > 0) ||
                stashSearch.more > 0 ||
                (found?.more ?? 0) > 0 ||
                (textFound?.capped ?? false)),
            searching: lookingUp || searching,
          }}
          placeholder={strings.search.placeholder}
          input={input}
          focusName={searchFocusName}
          combobox={{
            autoFocus: true,
            role: 'combobox',
            'aria-expanded': true,
            'aria-autocomplete': 'list',
            'aria-controls': resultsId,
            'aria-activedescendant': activeId,
          }}
          onQuery={(next) => onQuery(next)}
          onOptions={(next) => onQuery(query, next)}
          onStep={(step) => stepTo(stepMatch(active, keys.length, step))}
          onClose={onClose}
        />
      </div>
      <div
        ref={groups}
        className="locations-groups"
        id={resultsId}
        role={hasQuery ? 'listbox' : 'tree'}
        aria-label={strings.search.locations}
      >
        <BookmarksSection pinned={pinnedItems} rows={rows} onJump={jump} />
        {search.map((group, i) =>
          hasQuery && group.refs.length === 0 ? null : (
            <section
              key={group.kind}
              className="locations-group"
              role="group"
              aria-label={group.title}
            >
              <GroupHeading
                title={group.title}
                count={
                  hasQuery
                    ? group.refs.length + group.more
                    : index[i].refs.length
                }
              />
              <div className="locations-list">
                {hasQuery ? (
                  <SearchResults
                    group={group}
                    filter={filter}
                    rows={rows}
                    onJump={jump}
                  />
                ) : (
                  <RefTree
                    kind={group.kind}
                    tree={index[i].tree}
                    rows={rows}
                    onSelect={jump}
                  />
                )}
              </div>
            </section>
          ),
        )}
        <StashesSection
          stashes={drawnStashes.stashes}
          more={drawnStashes.more}
          filter={filter}
          rows={rows}
          onJump={jump}
        />
        {(hash || text) && (
          <CommitResultsSection
            hash={hash}
            lookingUp={lookingUp}
            searching={searching}
            found={commits}
            hashMore={found?.more ?? 0}
            capped={textFound?.capped ?? false}
            filter={filter}
            active={
              activeItem?.kind === 'commit' ? activeItem.commit.hash : undefined
            }
            rows={rows}
            onJump={jump}
          />
        )}
      </div>
    </div>
  );
}
