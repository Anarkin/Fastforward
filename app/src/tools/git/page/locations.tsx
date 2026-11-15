import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { searchedBookmarks } from './bookmarks';
import { BackIcon } from '../../../lib/page/icons';
import { columnFocusOf } from '../../../lib/page/columnFocus';
import { useDismiss } from '../../../lib/page/dismiss';
import { noRefs } from './commitListItems';
import { searchQueryOf } from './gitSelectors';
import { useGit, useGitActions } from './store';
import { strings } from '../../../lib/shared/strings';
import { searchFilter } from '../../../lib/shared/filter';
import { plainSearch } from '../../../lib/shared/searchOptions';
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
import { contextMenus, focusLeaves, popupKeyAction } from './locationKeys';
import {
  foundCommits,
  hashQuery,
  textQuery,
  enterTarget,
} from './locationQuery';
import { usePopupHeight } from './popupHeight';
import {
  BookmarksSection,
  CommitResultsSection,
  GroupHeading,
  SearchResults,
  StashesSection,
} from './locationGroups';

export function LocationsPopup({
  anchor,
}: {
  anchor: React.RefObject<HTMLElement | null>;
}) {
  const query = useGit(searchQueryOf);
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
  } = useGitActions();
  const onClose = useCallback(() => openSearch(false), [openSearch]);
  const popup = useRef<HTMLDivElement>(null);
  const height = usePopupHeight(popup);
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
  const filter = useMemo(() => searchFilter(query, plainSearch), [query]);
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
    return onSearchCommits(text);
  }, [text, onSearchCommits]);
  const textFound =
    text && commitSearch?.query === text ? commitSearch.result : undefined;
  const commits = useMemo(
    () => foundCommits(found?.commits ?? [], textFound?.commits ?? []),
    [found, textFound],
  );
  const lookingUp = hash !== undefined && found === undefined;
  const searching = text !== undefined && textFound === undefined;
  const nothingFound =
    commits.length === 0 &&
    !lookingUp &&
    !searching &&
    pinned.length === 0 &&
    search.every((group) => group.refs.length === 0) &&
    stashSearch.stashes.length === 0;
  const items = useMemo(
    () => resultItems(commits, search, stashSearch, pinnedItems),
    [commits, search, stashSearch, pinnedItems],
  );
  const [highlight, setHighlight] = useState<Highlighted>();
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
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
  useEffect(() => {
    if (activeId !== undefined) {
      popup.current?.ownerDocument
        .getElementById(activeId)
        ?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeId]);

  const jump = (target: string | undefined) => {
    if (target) {
      onJump(target);
      onClose();
    }
  };

  useDismiss(anchor, onClose, { ignore: contextMenus });

  const onKeyDown = (event: React.KeyboardEvent) => {
    const action = popupKeyAction(event.nativeEvent);
    if (typeof action === 'number') {
      event.preventDefault();
      const keys = hasQuery
        ? items.map(itemKey)
        : browsed.map((row) => row.key);
      const next = keys.at(nextActive(keys, active, action));
      if (next) {
        setHighlight({ query, key: next });
      }
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
      <div className="locations-search-row">
        <button
          className="nav-button"
          title={strings.common.close}
          onClick={onClose}
        >
          <BackIcon />
        </button>
        <input
          className={`locations-search ${query ? 'active' : ''}`}
          placeholder={strings.search.placeholder}
          ref={input}
          autoFocus
          role="combobox"
          aria-expanded
          aria-autocomplete="list"
          aria-controls={resultsId}
          aria-activedescendant={activeId}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
      </div>
      <div
        className="locations-groups"
        id={resultsId}
        role={hasQuery ? 'listbox' : 'tree'}
        aria-label={strings.search.locations}
      >
        <BookmarksSection pinned={pinnedItems} rows={rows} onJump={jump} />
        {hasQuery && !hash && nothingFound && (
          <div className="locations-empty">{strings.search.noMatches}</div>
        )}
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
