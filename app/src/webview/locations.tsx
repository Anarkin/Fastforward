import {
  useContext,
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
  RepositoryState,
  StashInfo,
  ToWebviewOf,
} from '../shared/protocol';
import { findRef } from '../shared/refNames';
import { pinnedRefs, type PinnedRefs } from './bookmarks';
import { byName } from './byName';
import { BackIcon } from './icons';
import { columnFocusOf } from './activeColumn';
import {
  CommitBubble,
  DetachedHead,
  HeadBubble,
  RefBubble,
  useCheckedOut,
} from './bubbles';
import { OpenContextMenu, refMenuTarget, useDismiss } from './contextMenu';
import { CommitRow } from './commitList';
import { Highlight } from './highlight';
import { FolderRow, treeIndent, twistyWidth } from './tree';
import { keymap } from '../shared/keymap';
import { strings } from '../shared/strings';
import { keyPressed } from './shortcuts';

const groups: readonly { kind: RefKind; title: string }[] = [
  { kind: 'branch', title: strings.search.localBranches },
  { kind: 'remote', title: strings.search.remoteBranches },
  { kind: 'tag', title: strings.search.tags },
];

const maxResults = 200;

export interface SearchGroup {
  readonly kind: RefKind;
  readonly title: string;
  readonly refs: readonly RefInfo[];
  readonly more: number;
}

export interface RefGroup {
  readonly kind: RefKind;
  readonly title: string;
  readonly refs: readonly RefInfo[];
  readonly names: readonly string[];
}

export function indexRefs(refs: readonly RefInfo[]): RefGroup[] {
  return groups.map((group) => {
    const sorted = refs
      .filter((ref) => ref.kind === group.kind)
      .toSorted(byName);
    return {
      ...group,
      refs: sorted,
      names: sorted.map((ref) => ref.name.toLowerCase()),
    };
  });
}

export function searchRefs(
  index: readonly RefGroup[],
  query: string,
  limit = maxResults,
): SearchGroup[] {
  const needle = query.trim().toLowerCase();
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

export function searchStashes(
  stashes: readonly StashInfo[],
  query: string,
  limit = maxResults,
): StashSearch {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return noStashes;
  }
  const found = stashes.filter((stash) =>
    [stash.name, stash.message].some((text) =>
      text.toLowerCase().includes(needle),
    ),
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

const pinnedSections = ['checkedOut', 'bookmarks'] as const;

type PinnedSectionName = (typeof pinnedSections)[number];

export interface PinnedResult {
  readonly kind: 'pinned';
  readonly section: PinnedSectionName;
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
  pinned: PinnedRefs,
  refs: readonly RefInfo[],
): PinnedResult[] {
  return pinnedSections.flatMap((section) =>
    pinned[section].map((bookmark) => ({
      kind: 'pinned' as const,
      section,
      bookmark,
      commit: pinnedCommit(bookmark, refs),
    })),
  );
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

const pinnedKey = (section: string, item: Bookmark) =>
  `pinned:${section}:${item.kind}:${item.name}`;

const folderKey = (kind: RefKind, path: string) => `folder:${kind}:${path}`;

export function itemKey(item: ResultItem): string {
  return item.kind === 'commit'
    ? commitKey(item.commit.hash)
    : item.kind === 'stash'
      ? stashKey(item.stash)
      : item.kind === 'pinned'
        ? pinnedKey(item.section, item.bookmark)
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

const hashLookupDelay = 150;

const commitSearchDelay = 250;

export function startAfter(delay: number, start: () => () => void): () => void {
  let stop: (() => void) | undefined;
  const timer = setTimeout(() => {
    stop = start();
  }, delay);
  return () => {
    clearTimeout(timer);
    stop?.();
  };
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
  refsByCommit,
  stashCommits,
  headCommit,
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
  refsByCommit: ReadonlyMap<string, readonly RefInfo[]>;
  stashCommits: ReadonlySet<string>;
  headCommit: string | undefined;
  rows: Rows;
  onJump: (commit: string) => void;
}) {
  const detached = useContext(DetachedHead);
  if (found.length === 0) {
    const status =
      lookingUp && hash !== undefined
        ? strings.search.lookingUp(hash)
        : searching
          ? strings.search.searching
          : hash && strings.search.noCommitStartsWith(hash);
    return status ? (
      <div className="row hash-suggestion empty">{status}</div>
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
            headCommit={headCommit}
            refs={refsByCommit.get(commit.hash) ?? []}
            stash={stashCommits.has(commit.hash)}
            detached={detached === commit.hash}
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
  repository,
  anchor,
  lookup,
  onLookup,
  commitSearch,
  onSearchCommits,
  onJump,
  onClose,
  query,
  onQuery,
  bookmarks,
}: {
  bookmarks: readonly Bookmark[];
  repository: RepositoryState | undefined;
  anchor: React.RefObject<HTMLElement | null>;
  lookup: ToWebviewOf<'hashLookup'> | undefined;
  onLookup: (query: string) => void;
  commitSearch: ToWebviewOf<'commitSearch'> | undefined;
  onSearchCommits: (query: string) => () => void;
  onJump: (commit: string) => void;
  onClose: () => void;
  query: string;
  onQuery: (query: string) => void;
}) {
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
  const refs = useMemo(() => repository?.refs ?? [], [repository]);
  const refsByCommit = useMemo(
    () => Map.groupBy(refs, (ref) => ref.commit),
    [refs],
  );
  const index = useMemo(() => indexRefs(refs), [refs]);
  const trees = useMemo(
    () =>
      index.map((group) => ({ kind: group.kind, tree: buildTree(group.refs) })),
    [index],
  );
  const search = useMemo(() => searchRefs(index, query), [index, query]);
  const stashes = useMemo(() => repository?.stashes ?? [], [repository]);
  const stashCommits = useMemo(
    () => new Set(stashes.map((stash) => stash.commit)),
    [stashes],
  );
  const stashSearch = useMemo(
    () => searchStashes(stashes, query),
    [stashes, query],
  );
  const drawnStashes = useMemo(
    () => shownStashes(stashes, query),
    [stashes, query],
  );
  const hasQuery = query.trim() !== '';
  const detached = useContext(DetachedHead);
  const head = repository?.head;
  const pinned = useMemo(
    () => pinnedRefs(bookmarks, refs, head, detached, query),
    [bookmarks, refs, head, detached, query],
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
    const timer = setTimeout(() => onLookup(hash), hashLookupDelay);
    return () => clearTimeout(timer);
  }, [hash, onLookup]);
  const found = hash && lookup?.query === hash ? lookup.result : undefined;
  const text = textQuery(query);
  useEffect(() => {
    if (!text) {
      return undefined;
    }
    return startAfter(commitSearchDelay, () => onSearchCommits(text));
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
    pinned.checkedOut.length === 0 &&
    pinned.bookmarks.length === 0 &&
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
    : browseRows(pinnedItems, trees, toggled, drawnStashes.stashes);
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
        <PinnedSection
          title={strings.search.checkedOut}
          section="checkedOut"
          items={pinned.checkedOut}
          refs={refs}
          rows={rows}
          onJump={jump}
        />
        <PinnedSection
          title={strings.search.bookmarks}
          section="bookmarks"
          items={pinned.bookmarks}
          refs={refs}
          rows={rows}
          onJump={jump}
        />
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
                    tree={trees[i].tree}
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
            refsByCommit={refsByCommit}
            stashCommits={stashCommits}
            headCommit={repository?.headCommit}
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

function PinnedSection({
  title,
  section,
  items,
  refs,
  rows,
  onJump,
}: {
  title: string;
  section: PinnedSectionName;
  items: readonly Bookmark[];
  refs: readonly RefInfo[];
  rows: Rows;
  onJump: (commit: string) => void;
}) {
  const detached = useContext(DetachedHead);
  if (items.length === 0) {
    return null;
  }
  return (
    <section className="locations-group" role="group" aria-label={title}>
      <GroupHeading title={title} count={items.length} />
      <div className="locations-list">
        {items.map((item) => {
          const commit = pinnedCommit(item, refs);
          const key = pinnedKey(section, item);
          return (
            <div
              key={`${item.kind}:${item.name}`}
              {...rowProps(rows, key, 1)}
              className={`row result pinned ${activeClass(rows, key)}`}
              onClick={() => commit && onJump(commit)}
            >
              {item.kind !== 'commit' ? (
                <RefBubble info={item} missing={commit === undefined} />
              ) : item.name === detached ? (
                <HeadBubble hash={item.name} />
              ) : (
                <CommitBubble hash={item.name} />
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
  const openMenu = useContext(OpenContextMenu);
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

export interface TreeNode {
  readonly name: string;
  readonly ref: RefInfo | undefined;
  readonly children: readonly TreeNode[];
}

interface GrowingNode {
  name: string;
  ref: RefInfo | undefined;
  children: Map<string, GrowingNode>;
}

const foldersFirst = (a: TreeNode, b: TreeNode) =>
  Number(b.children.length > 0) - Number(a.children.length > 0) || byName(a, b);

function sortedTree({ name, ref, children }: GrowingNode): TreeNode {
  return {
    name,
    ref,
    children: [...children.values()].map(sortedTree).toSorted(foldersFirst),
  };
}

export function buildTree(refs: readonly RefInfo[]): TreeNode {
  const root: GrowingNode = { name: '', ref: undefined, children: new Map() };
  for (const ref of refs) {
    let node = root;
    for (const part of ref.name.split('/')) {
      let child = node.children.get(part);
      if (!child) {
        child = { name: part, ref: undefined, children: new Map() };
        node.children.set(part, child);
      }
      node = child;
    }
    node.ref = ref;
  }
  return sortedTree(root);
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
  const openMenu = useContext(OpenContextMenu);
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
        style={{ top: depth * stickyRowHeight, zIndex: 100 - depth }}
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

export const stickyRowHeight = 24;

export function leafIndent(depth: number, withFolders: boolean): number {
  return treeIndent(depth) + (withFolders ? twistyWidth : 0);
}
