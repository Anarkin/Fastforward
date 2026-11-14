import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { isHashPrefix } from '../shared/hashes';
import type { CommitInfo, CommitResults, StashInfo } from '../shared/protocol';
import { searchedBookmarks } from './bookmarks';
import { BackIcon } from '../../../lib/page/icons';
import { columnFocusOf } from '../../../lib/page/columnFocus';
import { CommitBubble, HeadBubble, RefBubble } from './bubbles';
import { useDismiss } from '../../../lib/page/contextMenu';
import { useOpenMenu, refMenuTarget } from './menus';
import { CommitRow, noRefs } from './commitList';
import { detachedHead, searchQueryOf, useGit, useGitActions } from './store';
import { Highlight } from '../../../lib/page/highlight';
import { keymap } from '../../../lib/shared/keymap';
import { strings } from '../../../lib/shared/strings';
import { Words } from '../../../lib/page/name';
import { keyPressed } from '../../../lib/page/shortcuts';

import {
  SearchGroup,
  searchRefs,
  noStashList,
  searchStashes,
  shownStashes,
  RefLabel,
  PinnedResult,
  ResultItem,
  pinnedResults,
  resultItems,
  commitKey,
  stashKey,
  refKey,
  pinnedKey,
  itemKey,
} from './locationsSearch';

import {
  browseRows,
  Rows,
  rowProps,
  activeClass,
  Highlighted,
  currentActive,
  nextActive,
  RefTree,
} from './locationTree';

const minSearchLength = 3;

const commitIndent = 8;

export function foundCommits(
  byHash: readonly CommitInfo[],
  byText: readonly CommitInfo[],
): CommitInfo[] {
  const hashes = new Set(byHash.map((commit) => commit.hash));
  return [...byHash, ...byText.filter((commit) => !hashes.has(commit.hash))];
}

function textQuery(query: string): string | undefined {
  const trimmed = query.trim();
  return trimmed.length >= minSearchLength ? trimmed : undefined;
}

function hashQuery(query: string): string | undefined {
  const trimmed = query.trim().toLowerCase();
  return isHashPrefix(trimmed) ? trimmed : undefined;
}

export function enterTarget(
  query: string,
  found: CommitResults | undefined,
  active: ResultItem | undefined,
  picked = false,
): string | undefined {
  const hash = hashQuery(query);
  const named = active !== undefined && resultName(active) === query.trim();
  if (hash && found === undefined && !((picked || named) && active)) {
    return hash;
  }
  if (!query.trim() || !active) {
    return undefined;
  }
  return resultCommit(active);
}

function resultName(item: ResultItem): string | undefined {
  return item.kind === 'ref'
    ? item.ref.name
    : item.kind === 'pinned'
      ? item.bookmark.name
      : undefined;
}

function resultCommit(item: ResultItem): string | undefined {
  return item.kind === 'commit'
    ? item.commit.hash
    : item.kind === 'stash'
      ? item.stash.commit
      : item.kind === 'pinned'
        ? item.commit
        : item.ref.commit;
}

function CommitResultsSection({
  hash,
  lookingUp,
  searching,
  found,
  hashMore,
  capped,
  query,
  active,
  rows,
  onJump,
}: {
  hash: string | undefined;
  lookingUp: boolean;
  searching: boolean;
  found: readonly CommitInfo[];
  hashMore: number;
  capped: boolean;
  query: string;
  active: string | undefined;
  rows: Rows;
  onJump: (commit: string) => void;
}) {
  if (found.length === 0) {
    const status =
      lookingUp && hash !== undefined
        ? strings.search.lookingUp(hash)
        : searching
          ? strings.search.searching
          : hash && strings.search.noCommitStartsWith(hash);
    return status ? (
      <div className="row hash-suggestion empty">
        <Words>{status}</Words>
      </div>
    ) : null;
  }
  return (
    <section
      className="locations-group"
      role="group"
      aria-label={strings.search.commits}
    >
      <GroupHeading
        title={strings.search.commits}
        count={found.length + hashMore}
      />
      <div className="locations-list">
        {found.map((commit) => (
          <CommitRow
            key={commit.hash}
            commit={commit}
            selected={active}
            indent={commitIndent}
            onSelect={onJump}
            highlight={query}
            itemProps={rowProps(rows, commitKey(commit.hash), 1)}
          />
        ))}
        {(lookingUp || searching) && (
          <div className="locations-empty">{strings.search.searching}</div>
        )}
        {hashMore > 0 ? (
          <div className="locations-empty">{strings.search.more(hashMore)}</div>
        ) : (
          capped && (
            <div className="locations-empty">{strings.search.moreCommits}</div>
          )
        )}
      </div>
    </section>
  );
}

function popupBottom(popup: HTMLElement): number {
  return (
    popup.closest('.column')?.getBoundingClientRect().bottom ??
    window.innerHeight
  );
}

function usePopupHeight(
  popup: React.RefObject<HTMLElement | null>,
): number | undefined {
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const fit = () => {
      const element = popup.current;
      if (element) {
        const top = element.getBoundingClientRect().top;
        setHeight(Math.max(200, popupBottom(element) - top));
      }
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [popup]);
  return height;
}

const contextMenus = '.context-menu';

export function focusLeaves<
  Focused extends { closest(selector: string): unknown },
>(
  popup: { readonly contains: (focused: Focused) => boolean } | null,
  focused: Focused | null,
): boolean {
  return (
    focused !== null &&
    popup !== null &&
    !popup.contains(focused) &&
    focused.closest(contextMenus) === null
  );
}

export function popupKeyAction(
  event: Parameters<typeof keyPressed>[1],
): 1 | -1 | 'enter' | undefined {
  return (
    keyPressed(keymap.result, event) ??
    (keyPressed(keymap.go, event) ? 'enter' : undefined)
  );
}

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
  const search = useMemo(() => searchRefs(index, query), [index, query]);
  const stashSearch = useMemo(
    () => searchStashes(stashes, query),
    [stashes, query],
  );
  const drawnStashes = useMemo(
    () => shownStashes(stashes, query),
    [stashes, query],
  );
  const hasQuery = query.trim() !== '';
  const pinned = useMemo(
    () => searchedBookmarks(bookmarks, refs, query),
    [bookmarks, refs, query],
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
                    query={query}
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
          query={query}
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
            query={query.trim()}
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

function StashesSection({
  stashes,
  more,
  query,
  rows,
  onJump,
}: {
  stashes: readonly StashInfo[];
  more: number;
  query: string;
  rows: Rows;
  onJump: (commit: string) => void;
}) {
  if (stashes.length === 0) {
    return null;
  }
  return (
    <section
      className="locations-group"
      role="group"
      aria-label={strings.search.stashes}
    >
      <GroupHeading
        title={strings.search.stashes}
        count={stashes.length + more}
      />
      <div className="locations-list">
        {stashes.map((stash) => (
          <div
            key={stash.name}
            {...rowProps(rows, stashKey(stash), 1)}
            className={`row result ${activeClass(rows, stashKey(stash))}`}
            title={stash.message}
            onClick={() => onJump(stash.commit)}
          >
            <span className="badge stash">
              <Highlight text={stash.name} query={query} />
            </span>
            <span className="stash-message">
              <Highlight text={stash.message} query={query} />
            </span>
          </div>
        ))}
        {more > 0 && (
          <div className="locations-empty">{strings.search.more(more)}</div>
        )}
      </div>
    </section>
  );
}

function GroupHeading({ title, count }: { title: string; count: number }) {
  return (
    <header className="locations-heading">
      {title}
      <span className="locations-count">{count}</span>
    </header>
  );
}

function BookmarksSection({
  pinned,
  rows,
  onJump,
}: {
  pinned: readonly PinnedResult[];
  rows: Rows;
  onJump: (commit: string) => void;
}) {
  const detached = useGit(detachedHead);
  if (pinned.length === 0) {
    return null;
  }
  return (
    <section
      className="locations-group"
      role="group"
      aria-label={strings.search.bookmarks}
    >
      <GroupHeading title={strings.search.bookmarks} count={pinned.length} />
      <div className="locations-list">
        {pinned.map(({ bookmark, commit }) => {
          const key = pinnedKey(bookmark);
          return (
            <div
              key={`${bookmark.kind}:${bookmark.name}`}
              {...rowProps(rows, key, 1)}
              className={`row result pinned ${activeClass(rows, key)}`}
              onClick={() => commit && onJump(commit)}
            >
              {bookmark.kind !== 'commit' ? (
                <RefBubble info={bookmark} missing={commit === undefined} />
              ) : bookmark.name === detached ? (
                <HeadBubble hash={bookmark.name} />
              ) : (
                <CommitBubble hash={bookmark.name} />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SearchResults({
  group,
  query,
  rows,
  onJump,
}: {
  group: SearchGroup;
  query: string;
  rows: Rows;
  onJump: (commit: string) => void;
}) {
  const openMenu = useOpenMenu();
  return (
    <>
      {group.refs.map((ref) => (
        <div
          key={ref.name}
          {...rowProps(rows, refKey(ref), 1)}
          className={`row result ${activeClass(rows, refKey(ref))}`}
          title={ref.name}
          onClick={() => onJump(ref.commit)}
          onContextMenu={(event) => openMenu(event, refMenuTarget(ref))}
        >
          <RefLabel info={ref}>
            <Highlight text={ref.name} query={query} />
          </RefLabel>
        </div>
      ))}
      {group.more > 0 && (
        <div className="locations-empty">{strings.search.more(group.more)}</div>
      )}
    </>
  );
}
