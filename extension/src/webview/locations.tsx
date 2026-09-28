import {
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { HashLookup, RefInfo, RefKind } from '../protocol';
import { OpenContextMenu, useDismiss } from './contextMenu';
import { IndentGuides, treeIndent, twistyWidth } from './tree';

export interface Repository {
  head: string | undefined;
  headCommit: string | undefined;
  headUpstream: string | undefined;
  refs: readonly RefInfo[];
}

const groups: readonly { kind: RefKind; title: string }[] = [
  { kind: 'branch', title: 'Branches' },
  { kind: 'remote', title: 'Remotes' },
  { kind: 'tag', title: 'Tags' },
];

// At most this many matches are drawn per column, so a short search in a
// repository with thousands of branches stays instant
const maxResults = 200;

export interface SearchGroup {
  readonly kind: RefKind;
  readonly title: string;
  readonly refs: readonly RefInfo[];
  // Matches beyond the limit, which aren't drawn
  readonly more: number;
}

// The refs whose name contains the query, ignoring case, in a group per kind;
// every group is returned, as each has its own column
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

// A ref's name as a bubble in its kind's color, like everywhere else
function RefLabel({
  kind,
  checkedOut,
  children,
}: {
  kind: RefKind;
  checkedOut: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className={`badge ${kind} ${checkedOut ? 'checked-out' : ''}`}>
      {children}
    </span>
  );
}

// The name with the part matching the query highlighted
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

// The result Enter jumps to: a column, and a match in it
interface Active {
  readonly column: number;
  readonly index: number;
}

// The first match of the first column that has any
function firstMatch(search: readonly SearchGroup[]): Active {
  const column = search.findIndex((group) => group.refs.length > 0);
  return { column: Math.max(0, column), index: 0 };
}

// How long typing rests before a hash is looked up
const hashLookupDelay = 150;

// The typed text when it could be a hash, which git needs four characters of
function hashQuery(query: string): string | undefined {
  const trimmed = query.trim().toLowerCase();
  return /^[0-9a-f]{4,40}$/.test(trimmed) ? trimmed : undefined;
}

// The commit a typed hash is, or why there is none
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
        <span className="history-hash">{found.hash.slice(0, 7)}</span>
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

// The space the popup leaves under it, as much as the address bar leaves on
// its right: .nav-end and the nav bar's gap before it
function popupBottomGap(popup: HTMLElement): number {
  const bar = popup.closest('.nav-bar');
  const end = bar?.querySelector('.nav-end');
  if (!bar || !end) {
    return 0;
  }
  const gap = parseFloat(getComputedStyle(bar).columnGap) || 0;
  return end.getBoundingClientRect().width + gap;
}

// How tall a popup over the address bar can be: down to the same distance
// from the bottom as the bar keeps from the right, whatever the window's size
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

// Every branch, remote and tag in a popup over the address bar, a column
// each: the search in the bar's place, the selected commit's whole message,
// then the trees, or the matches while searching; picking one jumps to its
// commit and closes the popup, and so does Enter on a hash
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
}: {
  repository: Repository | undefined;
  // The selected commit; locations pointing at it are highlighted
  selected: string | undefined;
  // What opened it, where clicks don't close it
  anchor: React.RefObject<HTMLElement | null>;
  // Which commit a typed hash is, once looked up
  lookup: { query: string; result: HashLookup } | undefined;
  onLookup: (query: string) => void;
  onJump: (commit: string) => void;
  onClose: () => void;
  // Kept by the caller, so the search is still there when the popup reopens
  query: string;
  onQuery: (query: string) => void;
}) {
  const popup = useRef<HTMLDivElement>(null);
  const height = usePopupHeight(popup);
  const input = useRef<HTMLInputElement>(null);
  // A kept search is selected, so typing starts a new one
  useEffect(() => input.current?.select(), []);
  const refs = useMemo(() => repository?.refs ?? [], [repository]);
  const search = useMemo(() => searchRefs(refs, query), [refs, query]);
  const [active, setActive] = useState<Active>(() => firstMatch(search));
  const activeRef = search[active.column]?.refs[active.index];
  // A hash being typed is looked up once typing stops for a moment, and
  // shown on top like Chrome's first suggestion
  const hash = hashQuery(query);
  useEffect(() => {
    if (!hash) {
      return undefined;
    }
    const timer = setTimeout(() => onLookup(hash), hashLookupDelay);
    return () => clearTimeout(timer);
  }, [hash, onLookup]);
  const found = hash && lookup?.query === hash ? lookup.result : undefined;
  // The active result stays in view as the arrow keys move it, but the list
  // doesn't jump back to it while scrolled by hand
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

  // Closes on a click outside, Escape or the window losing focus, but not on
  // a click on the address bar, which holds it, or in its own right-click menu
  useDismiss(anchor, onClose, { ignore: '.context-menu' });

  // Up and down within a column, left and right to the nearest match of the
  // next column that has any
  const move = (columns: number, rows: number) => {
    if (rows !== 0) {
      const count = search[active.column]?.refs.length ?? 0;
      setActive({
        column: active.column,
        index: Math.max(0, Math.min(count - 1, active.index + rows)),
      });
      return;
    }
    for (
      let column = active.column + columns;
      column >= 0 && column < search.length;
      column += columns
    ) {
      const count = search[column].refs.length;
      if (count > 0) {
        setActive({ column, index: Math.min(active.index, count - 1) });
        return;
      }
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const moves: Record<string, [number, number]> = {
      ArrowDown: [0, 1],
      ArrowUp: [0, -1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    if (query && event.key in moves) {
      // Left and right move the caret in the search box unless it's empty
      event.preventDefault();
      const [columns, rows] = moves[event.key];
      move(columns, rows);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      // The commit a typed hash is, before the names it may also match
      jump(found?.kind === 'found' ? found.hash : activeRef?.commit);
    }
  };

  return (
    <div
      className="locations-popup"
      ref={popup}
      style={{ height }}
      onKeyDown={onKeyDown}
    >
      <input
        className="locations-search"
        placeholder="Search branches, remotes and tags, or enter a hash"
        ref={input}
        autoFocus
        value={query}
        onChange={(event) => {
          const next = event.target.value;
          onQuery(next);
          setActive(firstMatch(searchRefs(refs, next)));
        }}
      />
      {hash && <HashSuggestion hash={hash} found={found} onJump={jump} />}
      <div className="locations-columns">
        {search.map((group, column) => (
          <section key={group.kind} className="locations-column">
            <header className="locations-heading">
              {group.title.toUpperCase()} (
              {query
                ? group.refs.length + group.more
                : refs.filter((ref) => ref.kind === group.kind).length}
              )
            </header>
            <div className="locations-list">
              {query ? (
                <SearchResults
                  group={group}
                  query={query}
                  active={column === active.column ? activeRef : undefined}
                  selected={selected}
                  head={repository?.head}
                  onJump={jump}
                />
              ) : (
                <RefTree
                  refs={refs.filter((ref) => ref.kind === group.kind)}
                  selected={selected}
                  head={repository?.head}
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

function SearchResults({
  group,
  query,
  active,
  selected,
  head,
  onJump,
}: {
  group: SearchGroup;
  query: string;
  // The result Enter jumps to, when it is in this column
  active: RefInfo | undefined;
  selected: string | undefined;
  // The checked-out branch, marked like its bubble
  head: string | undefined;
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
          <RefLabel
            kind={ref.kind}
            checkedOut={ref.kind === 'branch' && ref.name === head}
          >
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

// Branch names like feat/foo are shown as folders, like Fork does
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

// The refs of one column as folders; the column's heading stands for the root
function RefTree({
  refs,
  selected,
  head,
  onSelect,
}: {
  refs: readonly RefInfo[];
  selected: string | undefined;
  // The checked-out branch, marked like its bubble
  head: string | undefined;
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
      head={head}
      onSelect={onSelect}
    />
  );
}

// Folders first, then refs, each A-Z
function TreeChildren({
  node,
  depth,
  selected,
  head,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selected: string | undefined;
  // The checked-out branch, marked like its bubble
  head: string | undefined;
  onSelect: (commit: string) => void;
}) {
  const openMenu = useContext(OpenContextMenu);
  const children = [...node.children.values()].toSorted(
    (a, b) =>
      Number(b.children.size > 0) - Number(a.children.size > 0) ||
      a.name.localeCompare(b.name),
  );
  return (
    <>
      {children.map((child) =>
        child.children.size > 0 ? (
          <TreeFolder
            key={child.name}
            node={child}
            depth={depth}
            selected={selected}
            head={head}
            onSelect={onSelect}
            // A column's only top folder, usually origin, starts open
            initiallyOpen={depth === 0 && children.length === 1}
          />
        ) : (
          <div
            key={child.name}
            className={`row tree-row leaf ${child.ref && child.ref.commit === selected ? 'selected' : ''}`}
            // Past the twisty space, so leaves line up with sibling folders
            style={{ paddingLeft: treeIndent(depth) + twistyWidth }}
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
              <RefLabel
                kind={child.ref.kind}
                checkedOut={
                  child.ref.kind === 'branch' && child.ref.name === head
                }
              >
                {child.name}
              </RefLabel>
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
  head,
  onSelect,
  initiallyOpen,
}: {
  node: TreeNode;
  depth: number;
  selected: string | undefined;
  // The checked-out branch, marked like its bubble
  head: string | undefined;
  onSelect: (commit: string) => void;
  initiallyOpen: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  // The folder's row sticks to the top, under its parents' rows, while its
  // contents scroll by; the group ends where it has to let go
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
          head={head}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}

// The height of every row in the popup's trees, so stuck folder rows stack
// exactly; matches .locations-list .tree-row in style.css
const stickyRowHeight = 24;
