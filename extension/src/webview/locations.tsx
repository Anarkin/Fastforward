import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { RefInfo, RefKind } from '../protocol';
import { OpenContextMenu } from './contextMenu';
import { IndentGuides, treeIndent, twistyWidth } from './tree';

export interface Repository {
  head: string | undefined;
  headCommit: string | undefined;
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

// Every branch, remote and tag in a popup under the Locations button, a
// column each: a search box, then the trees, or the matches while searching;
// picking one jumps to its commit and closes the popup
export function LocationsPopup({
  repository,
  selected,
  anchor,
  onJump,
  onClose,
  query,
  onQuery,
}: {
  repository: Repository | undefined;
  // The selected commit; locations pointing at it are highlighted
  selected: string | undefined;
  // The button that opened it, which toggles it instead of closing it here
  anchor: React.RefObject<HTMLElement | null>;
  onJump: (commit: string) => void;
  onClose: () => void;
  // Kept by the caller, so the search is still there when the popup reopens
  query: string;
  onQuery: (query: string) => void;
}) {
  const popup = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // A kept search is selected, so typing starts a new one
  useEffect(() => input.current?.select(), []);
  const refs = repository?.refs ?? [];
  const search = useMemo(() => searchRefs(refs, query), [refs, query]);
  const [active, setActive] = useState<Active>(() => firstMatch(search));
  const activeRef = search[active.column]?.refs[active.index];

  const jump = (commit: string | undefined) => {
    if (commit) {
      onJump(commit);
      onClose();
    }
  };

  // Closes on a click outside, but not on the button, which toggles it, or on
  // its own right-click menu
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        !popup.current?.contains(target) &&
        !anchor.current?.contains(target) &&
        !target.closest('.context-menu')
      ) {
        onClose();
      }
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [anchor, onClose]);

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
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (query && event.key in moves) {
      // Left and right move the caret in the search box unless it's empty
      event.preventDefault();
      const [columns, rows] = moves[event.key];
      move(columns, rows);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      jump(activeRef?.commit);
    }
  };

  return (
    <div className="locations-popup" ref={popup} onKeyDown={onKeyDown}>
      <input
        className="locations-search"
        placeholder="Search branches, remotes and tags"
        ref={input}
        autoFocus
        value={query}
        onChange={(event) => {
          const next = event.target.value;
          onQuery(next);
          setActive(firstMatch(searchRefs(refs, next)));
        }}
      />
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
              {group.kind === 'branch' && !query && (
                <HeadRow
                  repository={repository}
                  selected={selected}
                  onJump={jump}
                />
              )}
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
                  refs={refs.filter((ref) => ref.kind === group.kind)}
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

function HeadRow({
  repository,
  selected,
  onJump,
}: {
  repository: Repository | undefined;
  selected: string | undefined;
  onJump: (commit: string) => void;
}) {
  const headCommit = repository?.headCommit;
  return (
    <div
      className={`row head ${headCommit !== undefined && headCommit === selected ? 'selected' : ''}`}
      onClick={() => headCommit && onJump(headCommit)}
    >
      HEAD{repository?.head ? ` (${repository.head})` : ''}
    </div>
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
  // The result Enter jumps to, when it is in this column
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
          ref={(element) => {
            if (element && ref === active) {
              element.scrollIntoView({ block: 'nearest' });
            }
          }}
          onClick={() => onJump(ref.commit)}
          onContextMenu={(event) =>
            openMenu(event, {
              kind: 'ref',
              ref: { kind: ref.kind, name: ref.name },
            })
          }
        >
          <Highlight text={ref.name} query={query} />
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

// Folders first, then refs, each A-Z
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
            {child.name}
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
    <>
      <div
        className="row tree-row folder"
        style={{ paddingLeft: treeIndent(depth) }}
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
    </>
  );
}
