import {
  useContext,
  useEffect,
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
  ToWebviewOf,
} from '../shared/protocol';
import { findRef } from '../shared/refNames';
import { pinnedRefs } from './bookmarks';
import { byName } from './byName';
import { BackIcon } from './icons';
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
import { keyPressed } from './shortcuts';

const groups: readonly { kind: RefKind; title: string }[] = [
  { kind: 'branch', title: 'Local branches' },
  { kind: 'remote', title: 'Remote branches' },
  { kind: 'tag', title: 'Tags' },
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

export type ResultItem =
  | { readonly kind: 'commit'; readonly commit: CommitInfo }
  | { readonly kind: 'ref'; readonly ref: RefInfo };

export function resultItems(
  commits: readonly CommitInfo[],
  search: readonly SearchGroup[],
): ResultItem[] {
  return [
    ...commits.map((commit) => ({ kind: 'commit' as const, commit })),
    ...search.flatMap((group) =>
      group.refs.map((ref) => ({ kind: 'ref' as const, ref })),
    ),
  ];
}

export function itemKey(item: ResultItem): string {
  return item.kind === 'commit'
    ? `commit:${item.commit.hash}`
    : `${item.ref.kind}:${item.ref.name}`;
}

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
  items: readonly ResultItem[],
  active: number,
  step: 1 | -1,
): number {
  return Math.max(0, Math.min(items.length - 1, active + step));
}

const hashLookupDelay = 150;

const commitSearchDelay = 250;

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
  if (hash && found === undefined && !(picked && active)) {
    return hash;
  }
  if (!query.trim() || !active) {
    return undefined;
  }
  return active.kind === 'commit' ? active.commit.hash : active.ref.commit;
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
  headCommit,
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
  headCommit: string | undefined;
  onJump: (commit: string) => void;
}) {
  const detached = useContext(DetachedHead);
  if (found.length === 0) {
    const status = lookingUp
      ? `Looking for commit ${hash}…`
      : searching
        ? 'Searching commits…'
        : hash && `No commit starts with ${hash}`;
    return status ? (
      <div className="row hash-suggestion empty">{status}</div>
    ) : null;
  }
  return (
    <section className="locations-group">
      <GroupHeading title="Commits" count={found.length + hashMore} />
      <div className="locations-list">
        {found.map((commit) => (
          <CommitRow
            key={commit.hash}
            commit={commit}
            selected={active}
            headCommit={headCommit}
            refs={refsByCommit.get(commit.hash) ?? []}
            detached={detached === commit.hash}
            indent={commitIndent}
            onSelect={onJump}
            highlight={query}
          />
        ))}
        {(lookingUp || searching) && (
          <div className="locations-empty">Searching commits…</div>
        )}
        {hashMore > 0 ? (
          <div className="locations-empty">
            {hashMore} more; type more to narrow it down
          </div>
        ) : (
          capped && (
            <div className="locations-empty">
              More commits match; type more to narrow it down
            </div>
          )
        )}
      </div>
    </section>
  );
}

function popupBottomGap(popup: HTMLElement): number {
  return (
    parseFloat(getComputedStyle(popup).getPropertyValue('--gutter-width')) || 0
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
        setHeight(
          Math.max(200, window.innerHeight - top - popupBottomGap(element)),
        );
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
  query: string,
): 1 | -1 | 'enter' | undefined {
  const step = query.trim() ? keyPressed(keymap.result, event) : undefined;
  return step ?? (keyPressed(keymap.go, event) ? 'enter' : undefined);
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
  onSearchCommits: (query: string) => void;
  onJump: (commit: string) => void;
  onClose: () => void;
  query: string;
  onQuery: (query: string) => void;
}) {
  const popup = useRef<HTMLDivElement>(null);
  const height = usePopupHeight(popup);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.select(), []);
  const refs = useMemo(() => repository?.refs ?? [], [repository]);
  const refsByCommit = useMemo(
    () => Map.groupBy(refs, (ref) => ref.commit),
    [refs],
  );
  const index = useMemo(() => indexRefs(refs), [refs]);
  const search = useMemo(() => searchRefs(index, query), [index, query]);
  const hasQuery = query.trim() !== '';
  const detached = useContext(DetachedHead);
  const pinned = pinnedRefs(bookmarks, refs, repository?.head, detached, query);
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
    const timer = setTimeout(() => onSearchCommits(text), commitSearchDelay);
    return () => clearTimeout(timer);
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
    search.every((group) => group.refs.length === 0);
  const items = useMemo(() => resultItems(commits, search), [commits, search]);
  const [highlight, setHighlight] = useState<Highlighted>();
  const active = currentActive(items, query, highlight);
  const activeItem = hasQuery ? items.at(active) : undefined;
  const activeKey = activeItem && itemKey(activeItem);
  useEffect(() => {
    if (activeKey) {
      popup.current
        ?.querySelector('.row.result.active, .commit.selected')
        ?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeKey]);

  const jump = (target: string | undefined) => {
    if (target) {
      onJump(target);
      onClose();
    }
  };

  useDismiss(anchor, onClose, { ignore: contextMenus });

  const onKeyDown = (event: React.KeyboardEvent) => {
    const action = popupKeyAction(event.nativeEvent, query);
    if (typeof action === 'number') {
      event.preventDefault();
      const next = items.at(nextActive(items, active, action));
      if (next) {
        setHighlight({ query, key: itemKey(next) });
      }
    } else if (action === 'enter') {
      event.preventDefault();
      jump(enterTarget(query, found, activeItem, highlight?.query === query));
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
        <button className="nav-button" title="Close" onClick={onClose}>
          <BackIcon />
        </button>
        <input
          className="locations-search"
          placeholder="Search…"
          ref={input}
          autoFocus
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
      </div>
      <div className="locations-groups">
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
            headCommit={repository?.headCommit}
            onJump={jump}
          />
        )}
        <PinnedSection
          title="Checked out"
          items={pinned.checkedOut}
          refs={refs}
          onJump={jump}
        />
        <PinnedSection
          title="Bookmarks"
          items={pinned.bookmarks}
          refs={refs}
          onJump={jump}
        />
        {hasQuery && !hash && nothingFound && (
          <div className="locations-empty">No matches</div>
        )}
        {search.map((group, i) =>
          hasQuery && group.refs.length === 0 ? null : (
            <section key={group.kind} className="locations-group">
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
                    active={
                      activeItem?.kind === 'ref' ? activeItem.ref : undefined
                    }
                    onJump={jump}
                  />
                ) : (
                  <RefTree refs={index[i].refs} onSelect={jump} />
                )}
              </div>
            </section>
          ),
        )}
      </div>
    </div>
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
  items,
  refs,
  onJump,
}: {
  title: string;
  items: readonly Bookmark[];
  refs: readonly RefInfo[];
  onJump: (commit: string) => void;
}) {
  const detached = useContext(DetachedHead);
  if (items.length === 0) {
    return null;
  }
  return (
    <section className="locations-group">
      <GroupHeading title={title} count={items.length} />
      <div className="locations-list">
        {items.map((item) => {
          const commit =
            item.kind === 'commit' ? item.name : findRef(refs, item)?.commit;
          return (
            <div
              key={`${item.kind}:${item.name}`}
              className="row result pinned"
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
  active,
  onJump,
}: {
  group: SearchGroup;
  query: string;
  active: RefInfo | undefined;
  onJump: (commit: string) => void;
}) {
  const openMenu = useContext(OpenContextMenu);
  return (
    <>
      {group.refs.map((ref) => (
        <div
          key={ref.name}
          className={`row result ${ref === active ? 'active' : ''}`}
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
        <div className="locations-empty">
          {group.more} more; type more to narrow it down
        </div>
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
  refs,
  onSelect,
}: {
  refs: readonly RefInfo[];
  onSelect: (commit: string) => void;
}) {
  const tree = useMemo(() => buildTree(refs), [refs]);
  if (refs.length === 0) {
    return <div className="locations-empty">None</div>;
  }
  return <TreeChildren node={tree} depth={0} onSelect={onSelect} />;
}

function TreeChildren({
  node,
  depth,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
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
            node={child}
            depth={depth}
            onSelect={onSelect}
            initiallyOpen={depth === 0 && children.length === 1}
          />
        ) : (
          <div
            key={child.name}
            className="row tree-row leaf"
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
          {more} more; type to narrow them down
        </div>
      )}
    </>
  );
}

function TreeFolder({
  node,
  depth,
  onSelect,
  initiallyOpen,
}: {
  node: TreeNode;
  depth: number;
  onSelect: (commit: string) => void;
  initiallyOpen: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <div className="tree-group">
      <FolderRow
        path={node.name}
        depth={depth}
        open={open}
        className="sticky"
        style={{ top: depth * stickyRowHeight, zIndex: 100 - depth }}
        onToggle={() => setOpen(!open)}
      >
        {node.name}
      </FolderRow>
      {open && (
        <TreeChildren node={node} depth={depth + 1} onSelect={onSelect} />
      )}
    </div>
  );
}

export const stickyRowHeight = 24;

export function leafIndent(depth: number, withFolders: boolean): number {
  return treeIndent(depth) + (withFolders ? twistyWidth : 0);
}
