import {
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { isHashPrefix, shortHash } from '../shared/hashes';
import type {
  Bookmark,
  HashLookup,
  RefInfo,
  RefKind,
  RepositoryState,
} from '../shared/protocol';
import { findRef } from '../shared/refNames';
import { pinnedRefs } from './bookmarks';
import { BackIcon } from './icons';
import {
  CheckedOutBranch,
  CommitBubble,
  DetachedHead,
  HeadBubble,
  RefBubble,
} from './bubbles';
import { OpenContextMenu, useDismiss } from './contextMenu';
import { IndentGuides, treeIndent, twistyWidth } from './tree';

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

export function searchRefs(
  refs: readonly RefInfo[],
  query: string,
  limit = maxResults,
): SearchGroup[] {
  const needle = query.toLowerCase();
  return groups.map((group) => {
    const matches = refs
      .filter(
        (ref) =>
          ref.kind === group.kind && ref.name.toLowerCase().includes(needle),
      )
      .toSorted((a, b) => a.name.localeCompare(b.name));
    return {
      ...group,
      refs: matches.slice(0, limit),
      more: Math.max(0, matches.length - limit),
    };
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
  const checkedOutBranch = useContext(CheckedOutBranch);
  const checkedOut = kind === 'branch' && info.name === checkedOutBranch;
  return (
    <span className={`badge ${kind} ${checkedOut ? 'checked-out' : ''}`}>
      {children}
    </span>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  const start = text.toLowerCase().indexOf(query.toLowerCase());
  if (!query || start === -1) {
    return <>{text}</>;
  }
  const end = start + query.length;
  return (
    <>
      {text.slice(0, start)}
      <mark className="match">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}

export interface Active {
  readonly column: number;
  readonly index: number;
}

function firstMatch(search: readonly SearchGroup[]): Active {
  const column = search.findIndex((group) => group.refs.length > 0);
  return { column: Math.max(0, column), index: 0 };
}

export function nextActive(
  search: readonly SearchGroup[],
  active: Active,
  step: 1 | -1,
): Active {
  const index = active.index + step;
  if (index >= 0 && index < (search[active.column]?.refs.length ?? 0)) {
    return { column: active.column, index };
  }
  for (
    let column = active.column + step;
    column >= 0 && column < search.length;
    column += step
  ) {
    const count = search[column].refs.length;
    if (count > 0) {
      return { column, index: step > 0 ? 0 : count - 1 };
    }
  }
  return active;
}

const hashLookupDelay = 150;

function hashQuery(query: string): string | undefined {
  const trimmed = query.trim().toLowerCase();
  return isHashPrefix(trimmed) ? trimmed : undefined;
}

export function enterTarget(
  query: string,
  found: HashLookup | undefined,
  active: RefInfo | undefined,
): string | undefined {
  const hash = hashQuery(query);
  if (found?.kind === 'found') {
    return found.hash;
  }
  if (hash && found === undefined) {
    return hash;
  }
  return query ? active?.commit : undefined;
}

function HashSuggestion({
  hash,
  found,
  onJump,
}: {
  hash: string;
  found: HashLookup | undefined;
  onJump: (commit: string) => void;
}) {
  if (found?.kind === 'found') {
    return (
      <div
        className="row hash-suggestion active"
        title={found.hash}
        onClick={() => onJump(found.hash)}
      >
        Go to commit{' '}
        <span className="history-hash">{shortHash(found.hash)}</span>
        {found.subject}
      </div>
    );
  }
  return (
    <div className="row hash-suggestion empty">
      {found === undefined
        ? `Looking for commit ${hash}…`
        : found.kind === 'none'
          ? `No commit starts with ${hash}`
          : `${found.count} commits start with ${hash}, type more`}
    </div>
  );
}

function popupBottomGap(popup: HTMLElement): number {
  const bar = popup.closest('.nav-bar');
  return bar
    ? parseFloat(getComputedStyle(bar).paddingRight) || 0
    : parseFloat(getComputedStyle(popup).getPropertyValue('--gutter-width')) ||
        0;
}

export function usePopupHeight(
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

export function LocationsPopup({
  repository,
  selected,
  anchor,
  lookup,
  onLookup,
  onJump,
  onClose,
  query,
  onQuery,
  bookmarks,
}: {
  bookmarks: readonly Bookmark[];
  repository: RepositoryState | undefined;
  selected: string | undefined;
  anchor: React.RefObject<HTMLElement | null>;
  lookup: { query: string; result: HashLookup } | undefined;
  onLookup: (query: string) => void;
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
  const search = useMemo(() => searchRefs(refs, query), [refs, query]);
  const detached = useContext(DetachedHead);
  const pinned = pinnedRefs(
    bookmarks,
    refs,
    repository?.head,
    repository?.headUpstream,
    detached,
    query,
  );
  const byKind = useMemo(
    () =>
      new Map(
        groups.map((group) => [
          group.kind,
          refs.filter((ref) => ref.kind === group.kind),
        ]),
      ),
    [refs],
  );
  const [active, setActive] = useState<Active>(() => firstMatch(search));
  const activeRef = search[active.column]?.refs[active.index];
  const hash = hashQuery(query);
  useEffect(() => {
    if (!hash) {
      return undefined;
    }
    const timer = setTimeout(() => onLookup(hash), hashLookupDelay);
    return () => clearTimeout(timer);
  }, [hash, onLookup]);
  const found = hash && lookup?.query === hash ? lookup.result : undefined;
  useEffect(() => {
    if (activeRef) {
      popup.current
        ?.querySelector('.row.result.active')
        ?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeRef]);

  const jump = (target: string | undefined) => {
    if (target) {
      onJump(target);
      onClose();
    }
  };

  useDismiss(anchor, onClose, { ignore: '.context-menu' });

  const onKeyDown = (event: React.KeyboardEvent) => {
    const steps: Record<string, 1 | -1> = { ArrowDown: 1, ArrowUp: -1 };
    if (query && event.key in steps) {
      event.preventDefault();
      setActive(nextActive(search, active, steps[event.key]));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      jump(enterTarget(query, found, activeRef));
    }
  };

  return (
    <div
      className="locations-popup"
      ref={popup}
      style={{ height }}
      onKeyDown={onKeyDown}
    >
      <div className="locations-search-row">
        <button className="nav-button" title="Close (Esc)" onClick={onClose}>
          <BackIcon />
        </button>
        <input
          className="locations-search"
          placeholder="Search…"
          ref={input}
          autoFocus
          value={query}
          onChange={(event) => {
            const next = event.target.value;
            onQuery(next);
            setActive(firstMatch(searchRefs(refs, next)));
          }}
        />
      </div>
      {hash && <HashSuggestion hash={hash} found={found} onJump={jump} />}
      <div className="locations-groups">
        <PinnedSection
          title="Checked out"
          items={pinned.checkedOut}
          refs={refs}
          selected={undefined}
          onJump={jump}
        />
        <PinnedSection
          title="Bookmarks"
          items={pinned.bookmarks}
          refs={refs}
          selected={selected}
          onJump={jump}
        />
        {search.map((group, column) => (
          <section key={group.kind} className="locations-group">
            <GroupHeading
              title={group.title}
              count={
                query
                  ? group.refs.length + group.more
                  : (byKind.get(group.kind) ?? []).length
              }
            />
            <div className="locations-list">
              {query ? (
                <SearchResults
                  group={group}
                  query={query}
                  active={column === active.column ? activeRef : undefined}
                  selected={selected}
                  onJump={jump}
                />
              ) : (
                <RefTree
                  refs={byKind.get(group.kind) ?? []}
                  selected={selected}
                  onSelect={jump}
                />
              )}
            </div>
          </section>
        ))}
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
  selected,
  onJump,
}: {
  title: string;
  items: readonly Bookmark[];
  refs: readonly RefInfo[];
  selected: string | undefined;
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
              className={`row result pinned ${commit !== undefined && commit === selected ? 'selected' : ''}`}
              onClick={() => commit && onJump(commit)}
            >
              {item.kind !== 'commit' ? (
                <RefBubble info={item} missing={commit === undefined} />
              ) : item.name === detached ? (
                <HeadBubble commit={item.name} />
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
  selected,
  onJump,
}: {
  group: SearchGroup;
  query: string;
  active: RefInfo | undefined;
  selected: string | undefined;
  onJump: (commit: string) => void;
}) {
  const openMenu = useContext(OpenContextMenu);
  if (group.refs.length === 0) {
    return <div className="locations-empty">No matches</div>;
  }
  return (
    <>
      {group.refs.map((ref) => (
        <div
          key={ref.name}
          className={`row result ${ref === active ? 'active' : ''} ${ref.commit === selected ? 'selected' : ''}`}
          title={ref.name}
          onClick={() => onJump(ref.commit)}
          onContextMenu={(event) =>
            openMenu(event, {
              kind: 'ref',
              ref: { kind: ref.kind, name: ref.name },
            })
          }
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

interface TreeNode {
  name: string;
  ref: RefInfo | undefined;
  children: Map<string, TreeNode>;
}

function buildTree(refs: readonly RefInfo[]): TreeNode {
  const root: TreeNode = { name: '', ref: undefined, children: new Map() };
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
  return root;
}

function RefTree({
  refs,
  selected,
  onSelect,
}: {
  refs: readonly RefInfo[];
  selected: string | undefined;
  onSelect: (commit: string) => void;
}) {
  const tree = useMemo(() => buildTree(refs), [refs]);
  if (refs.length === 0) {
    return <div className="locations-empty">None</div>;
  }
  return (
    <TreeChildren
      node={tree}
      depth={0}
      selected={selected}
      onSelect={onSelect}
    />
  );
}

function TreeChildren({
  node,
  depth,
  selected,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selected: string | undefined;
  onSelect: (commit: string) => void;
}) {
  const openMenu = useContext(OpenContextMenu);
  const children = [...node.children.values()].toSorted(
    (a, b) =>
      Number(b.children.size > 0) - Number(a.children.size > 0) ||
      a.name.localeCompare(b.name),
  );
  const withFolders = children.some((child) => child.children.size > 0);
  return (
    <>
      {children.map((child) =>
        child.children.size > 0 ? (
          <TreeFolder
            key={child.name}
            node={child}
            depth={depth}
            selected={selected}
            onSelect={onSelect}
            initiallyOpen={depth === 0 && children.length === 1}
          />
        ) : (
          <div
            key={child.name}
            className={`row tree-row leaf ${child.ref && child.ref.commit === selected ? 'selected' : ''}`}
            style={{ paddingLeft: leafIndent(depth, withFolders) }}
            title={child.ref?.name}
            onClick={() => child.ref && onSelect(child.ref.commit)}
            onContextMenu={(event) =>
              child.ref &&
              openMenu(event, {
                kind: 'ref',
                ref: { kind: child.ref.kind, name: child.ref.name },
              })
            }
          >
            <IndentGuides depth={depth} />
            {child.ref ? (
              <RefLabel info={child.ref}>{child.name}</RefLabel>
            ) : (
              child.name
            )}
          </div>
        ),
      )}
    </>
  );
}

function TreeFolder({
  node,
  depth,
  selected,
  onSelect,
  initiallyOpen,
}: {
  node: TreeNode;
  depth: number;
  selected: string | undefined;
  onSelect: (commit: string) => void;
  initiallyOpen: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <div className="tree-group">
      <div
        className="row tree-row folder sticky"
        style={{
          paddingLeft: treeIndent(depth),
          top: depth * stickyRowHeight,
          zIndex: 100 - depth,
        }}
        onClick={() => setOpen(!open)}
      >
        <IndentGuides depth={depth} />
        <span className="twisty">{open ? '▾' : '▸'}</span>
        {node.name}
      </div>
      {open && (
        <TreeChildren
          node={node}
          depth={depth + 1}
          selected={selected}
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
