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
import type {
  Bookmark,
  CommitInfo,
  CommitResults,
  RefInfo,
  RefKind,
  StashInfo,
} from '../shared/protocol';
import { findRef } from '../shared/refNames';
import { searchedBookmarks } from './bookmarks';
import { BackIcon } from '../../../ui/icons';
import { columnFocusOf } from '../../../ui/columnFocus';
import { CommitBubble, HeadBubble, RefBubble, useCheckedOut } from './bubbles';
import { useDismiss } from '../../../ui/contextMenu';
import { useOpenMenu, refMenuTarget } from './menus';
import { CommitRow, noRefs } from './commitList';
import { detachedHead, searchQueryOf, useGit, useGitActions } from './store';
import { Highlight } from '../../../ui/highlight';
import { FolderRow, treeIndent, twistyWidth } from './tree';
import { keymap } from '../../../shell/shared/keymap';
import { strings } from '../../../shared/strings';
import { Words } from '../../../ui/name';
import { keyPressed } from '../../../ui/shortcuts';
import { folded } from '../../../shared/textMatches';
import type { RefGroup, TreeNode } from './refIndex';

const maxResults = 200;

export interface SearchGroup {
  readonly kind: RefKind;
  readonly title: string;
  readonly refs: readonly RefInfo[];
  readonly more: number;
}

export function searchRefs(
  index: readonly RefGroup[],
  query: string,
  limit = maxResults,
): SearchGroup[] {
  const needle = folded(query.trim());
  return index.map(({ kind, title, refs, names }) => {
    const found: RefInfo[] = [];
    let more = 0;
    if (needle) {
      for (const [i, name] of names.entries()) {
        if (!name.includes(needle)) {
          continue;
        }
        if (found.length < limit) {
          found.push(refs[i]);
        } else {
          more++;
        }
      }
    }
    return { kind, title, refs: found, more };
  });
}

export interface StashSearch {
  readonly stashes: readonly StashInfo[];
  readonly more: number;
}

const noStashes: StashSearch = { stashes: [], more: 0 };

const noStashList: readonly StashInfo[] = [];

export function searchStashes(
  stashes: readonly StashInfo[],
  query: string,
  limit = maxResults,
): StashSearch {
  const needle = folded(query.trim());
  if (!needle) {
    return noStashes;
  }
  const found = stashes.filter((stash) =>
    [stash.name, stash.message].some((text) => folded(text).includes(needle)),
  );
  return cappedStashes(found, limit);
}

export function shownStashes(
  stashes: readonly StashInfo[],
  query: string,
  limit = maxResults,
): StashSearch {
  return query.trim()
    ? searchStashes(stashes, query, limit)
    : cappedStashes(stashes, limit);
}

function cappedStashes(
  stashes: readonly StashInfo[],
  limit: number,
): StashSearch {
  return {
    stashes: stashes.slice(0, limit),
    more: Math.max(0, stashes.length - limit),
  };
}

function RefLabel({
  info,
  children,
}: {
  info: RefInfo;
  children: React.ReactNode;
}) {
  const { kind } = info;
  const checkedOut = useCheckedOut(info);
  return (
    <span className={`badge ${kind} ${checkedOut ? 'checked-out' : ''}`}>
      {children}
    </span>
  );
}

export interface PinnedResult {
  readonly kind: 'pinned';
  readonly bookmark: Bookmark;
  readonly commit: string | undefined;
}

export type ResultItem =
  | { readonly kind: 'commit'; readonly commit: CommitInfo }
  | { readonly kind: 'ref'; readonly ref: RefInfo }
  | { readonly kind: 'stash'; readonly stash: StashInfo }
  | PinnedResult;

const pinnedCommit = (item: Bookmark, refs: readonly RefInfo[]) =>
  item.kind === 'commit' ? item.name : findRef(refs, item)?.commit;

export function pinnedResults(
  bookmarks: readonly Bookmark[],
  refs: readonly RefInfo[],
): PinnedResult[] {
  return bookmarks.map((bookmark) => ({
    kind: 'pinned' as const,
    bookmark,
    commit: pinnedCommit(bookmark, refs),
  }));
}

export function resultItems(
  commits: readonly CommitInfo[],
  search: readonly SearchGroup[],
  found: StashSearch = noStashes,
  pinned: readonly PinnedResult[] = [],
): ResultItem[] {
  return [
    ...pinned,
    ...search.flatMap((group) =>
      group.refs.map((ref) => ({ kind: 'ref' as const, ref })),
    ),
    ...found.stashes.map((stash) => ({ kind: 'stash' as const, stash })),
    ...commits.map((commit) => ({ kind: 'commit' as const, commit })),
  ];
}

const commitKey = (hash: string) => `commit:${hash}`;

const stashKey = (stash: StashInfo) => `stash:${stash.name}`;

const refKey = (ref: RefInfo) => `${ref.kind}:${ref.name}`;

const pinnedKey = (item: Bookmark) => `pinned:${item.kind}:${item.name}`;

const folderKey = (kind: RefKind, path: string) => `folder:${kind}:${path}`;

export function itemKey(item: ResultItem): string {
  return item.kind === 'commit'
    ? commitKey(item.commit.hash)
    : item.kind === 'stash'
      ? stashKey(item.stash)
      : item.kind === 'pinned'
        ? pinnedKey(item.bookmark)
        : refKey(item.ref);
}

type BrowseRow =
  | {
      readonly kind: 'jump';
      readonly key: string;
      readonly commit: string | undefined;
    }
  | { readonly kind: 'folder'; readonly key: string };

function folderOpen(
  toggled: ReadonlySet<string>,
  key: string,
  depth: number,
  siblings: number,
): boolean {
  return (depth === 0 && siblings === 1) !== toggled.has(key);
}

function treeRows(
  node: TreeNode,
  kind: RefKind,
  toggled: ReadonlySet<string>,
  depth = 0,
  prefix = '',
): BrowseRow[] {
  return shownChildren(node.children).shown.flatMap((child): BrowseRow[] => {
    const path = `${prefix}${child.name}`;
    if (child.children.length === 0) {
      return child.ref
        ? [{ kind: 'jump', key: refKey(child.ref), commit: child.ref.commit }]
        : [];
    }
    const key = folderKey(kind, path);
    return [
      { kind: 'folder', key },
      ...(folderOpen(toggled, key, depth, node.children.length)
        ? treeRows(child, kind, toggled, depth + 1, `${path}/`)
        : []),
    ];
  });
}

function browseRows(
  pinned: readonly PinnedResult[],
  trees: readonly { kind: RefKind; tree: TreeNode }[],
  toggled: ReadonlySet<string>,
  stashes: readonly StashInfo[],
): BrowseRow[] {
  return [
    ...pinned.map((item): BrowseRow => ({
      kind: 'jump',
      key: itemKey(item),
      commit: item.commit,
    })),
    ...trees.flatMap(({ kind, tree }) => treeRows(tree, kind, toggled)),
    ...stashes.map((stash): BrowseRow => ({
      kind: 'jump',
      key: stashKey(stash),
      commit: stash.commit,
    })),
  ];
}

interface Rows {
  readonly tree: boolean;
  readonly id: (key: string) => string;
  readonly active: string | undefined;
  readonly toggled: ReadonlySet<string>;
  readonly onToggle: (key: string) => void;
}

function rowProps(
  rows: Rows,
  key: string,
  level: number,
): React.HTMLAttributes<HTMLDivElement> {
  return {
    id: rows.id(key),
    role: rows.tree ? 'treeitem' : 'option',
    'aria-selected': key === rows.active,
    'aria-level': rows.tree ? level : undefined,
  };
}

const activeClass = (rows: Rows, key: string | undefined) =>
  key !== undefined && key === rows.active ? 'active' : '';

export interface Highlighted {
  readonly query: string;
  readonly key: string;
}

export function currentActive(
  items: readonly ResultItem[],
  query: string,
  highlight: Highlighted | undefined,
): number {
  if (highlight?.query === query) {
    const index = items.findIndex((item) => itemKey(item) === highlight.key);
    if (index >= 0) {
      return index;
    }
  }
  return 0;
}

export function nextActive(
  items: readonly unknown[],
  active: number,
  step: 1 | -1,
): number {
  return Math.max(0, Math.min(items.length - 1, active + step));
}

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

export function shownChildren(
  children: readonly TreeNode[],
  limit = maxResults,
): { shown: readonly TreeNode[]; more: number } {
  return {
    shown: children.slice(0, limit),
    more: Math.max(0, children.length - limit),
  };
}

function RefTree({
  kind,
  tree,
  rows,
  onSelect,
}: {
  kind: RefKind;
  tree: TreeNode;
  rows: Rows;
  onSelect: (commit: string) => void;
}) {
  if (tree.children.length === 0) {
    return <div className="locations-empty">{strings.search.none}</div>;
  }
  return (
    <TreeChildren
      kind={kind}
      node={tree}
      depth={0}
      prefix=""
      rows={rows}
      onSelect={onSelect}
    />
  );
}

function TreeChildren({
  kind,
  node,
  depth,
  prefix,
  rows,
  onSelect,
}: {
  kind: RefKind;
  node: TreeNode;
  depth: number;
  prefix: string;
  rows: Rows;
  onSelect: (commit: string) => void;
}) {
  const openMenu = useOpenMenu();
  const { children } = node;
  const withFolders = children.some((child) => child.children.length > 0);
  const { shown, more } = shownChildren(children);
  return (
    <>
      {shown.map((child) =>
        child.children.length > 0 ? (
          <TreeFolder
            key={child.name}
            kind={kind}
            node={child}
            depth={depth}
            path={`${prefix}${child.name}`}
            siblings={children.length}
            rows={rows}
            onSelect={onSelect}
          />
        ) : (
          <div
            key={child.name}
            {...(child.ref && rowProps(rows, refKey(child.ref), depth + 1))}
            className={`row tree-row leaf ${activeClass(rows, child.ref && refKey(child.ref))}`}
            style={{ paddingLeft: leafIndent(depth, withFolders) }}
            title={child.ref?.name}
            onClick={() => child.ref && onSelect(child.ref.commit)}
            onContextMenu={(event) =>
              child.ref && openMenu(event, refMenuTarget(child.ref))
            }
          >
            {child.ref ? (
              <RefLabel info={child.ref}>{child.name}</RefLabel>
            ) : (
              child.name
            )}
          </div>
        ),
      )}
      {more > 0 && (
        <div
          className="locations-empty"
          style={{ paddingLeft: leafIndent(depth, withFolders) }}
        >
          {strings.search.moreInFolder(more)}
        </div>
      )}
    </>
  );
}

function TreeFolder({
  kind,
  node,
  depth,
  path,
  siblings,
  rows,
  onSelect,
}: {
  kind: RefKind;
  node: TreeNode;
  depth: number;
  path: string;
  siblings: number;
  rows: Rows;
  onSelect: (commit: string) => void;
}) {
  const key = folderKey(kind, path);
  const open = folderOpen(rows.toggled, key, depth, siblings);
  return (
    <div className="tree-group">
      <FolderRow
        path={node.name}
        depth={depth}
        open={open}
        className={`sticky ${activeClass(rows, key)}`}
        style={{ top: stuckRowTop(depth), zIndex: 100 - depth }}
        onToggle={() => rows.onToggle(key)}
        itemProps={{
          ...rowProps(rows, key, depth + 1),
          'aria-expanded': open,
        }}
      >
        {node.name}
      </FolderRow>
      {open && (
        <TreeChildren
          kind={kind}
          node={node}
          depth={depth + 1}
          prefix={`${path}/`}
          rows={rows}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}

export function stuckRowTop(depth: number): string {
  return `calc(${depth} * var(--row-line-height))`;
}

export function leafIndent(depth: number, withFolders: boolean): number {
  return treeIndent(depth) + (withFolders ? twistyWidth : 0);
}
