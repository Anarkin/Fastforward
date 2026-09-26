import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  workingTreeHash,
  type CommitInfo,
  type FileChange,
  type RefInfo,
  type TabInfo,
  type ToExtension,
  type ToWebview,
} from '../protocol';
import { CommitHistory, commitPageSize } from './commitHistory';
import { ColumnResizingProvider, Resizer, useColumnWidths } from './columns';
import { parsePatch, type DiffFile } from './diff';

interface Props {
  post: (message: ToExtension) => void;
}

interface Repository {
  head: string | undefined;
  headCommit: string | undefined;
  refs: readonly RefInfo[];
}

// A position to scroll the commit list to; a new object scrolls again even to
// the same position
interface ScrollTarget {
  readonly index: number;
}

export function App({ post }: Props) {
  const [tabs, setTabs] = useState<readonly TabInfo[]>([]);
  const [activeTab, setActiveTab] = useState<string>();
  const activeTabRef = useRef<string>(undefined);
  const [repository, setRepository] = useState<Repository>();
  // Filled in place as pages arrive; the version re-renders the list
  const [history, setHistory] = useState<CommitHistory>();
  const historyRef = useRef<CommitHistory>(undefined);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [scrollTarget, setScrollTarget] = useState<ScrollTarget>();
  // Number of uncommitted files, undefined until the extension reports it
  const [workingTree, setWorkingTree] = useState<number>();
  const [hash, setHash] = useState<string>();
  const [files, setFiles] = useState<readonly FileChange[]>([]);
  const [path, setPath] = useState<string>();
  const [patch, setPatch] = useState('');
  const [error, setError] = useState<string>();
  const saveColumnWidths = useCallback(
    (widths: readonly number[]) => post({ type: 'setColumnWidths', widths }),
    [post],
  );
  const columns = useColumnWidths(saveColumnWidths);
  const loadColumnWidths = columns.load;

  useEffect(() => {
    const onMessage = (event: MessageEvent<ToWebview>) => {
      const message = event.data;
      switch (message.type) {
        case 'layout':
          loadColumnWidths(message.columnWidths);
          break;
        case 'tabs':
          if (activeTabRef.current !== message.active) {
            clear();
          }
          activeTabRef.current = message.active;
          setTabs(message.tabs);
          setActiveTab(message.active);
          break;
        case 'repository':
          setRepository(message);
          break;
        case 'commits': {
          const next = new CommitHistory(message.total, message.decorations);
          next.add(0, message.commits);
          historyRef.current = next;
          setHistory(next);
          setScrollTarget(
            message.selectedIndex === undefined
              ? undefined
              : { index: message.selectedIndex },
          );
          break;
        }
        case 'commitPage':
          historyRef.current?.add(message.start, message.commits);
          setHistoryVersion((version) => version + 1);
          break;
        case 'reveal':
          showCommit(message.hash);
          setScrollTarget({ index: message.index });
          break;
        case 'workingTree':
          setWorkingTree(message.files);
          break;
        case 'files':
          setHash(message.hash);
          setFiles(message.files);
          break;
        case 'diff':
          setHash(message.hash);
          setPath(message.path);
          setPatch(message.patch);
          break;
        case 'error':
          setError(message.message);
          break;
      }
    };
    window.addEventListener('message', onMessage);
    post({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, [post, loadColumnWidths]);

  // Forgets everything shown for the previous tab
  function clear() {
    setRepository(undefined);
    historyRef.current = undefined;
    setHistory(undefined);
    setScrollTarget(undefined);
    setWorkingTree(undefined);
    setHash(undefined);
    setFiles([]);
    setPath(undefined);
    setPatch('');
    setError(undefined);
  }

  // Shows a commit as selected while its files and diff load
  function showCommit(next: string | undefined) {
    setHash(next);
    setFiles([]);
    setPath(undefined);
    setPatch('');
  }

  const log = useCallback(
    (message: string) => post({ type: 'log', level: 'info', message }),
    [post],
  );

  const loadCommits = useCallback(
    (start: number) =>
      post({ type: 'loadCommits', start, count: commitPageSize }),
    [post],
  );

  const refsByCommit = useMemo(() => {
    const map = new Map<string, RefInfo[]>();
    for (const info of repository?.refs ?? []) {
      map.set(info.commit, [...(map.get(info.commit) ?? []), info]);
    }
    return map;
  }, [repository]);

  const commit = history?.find(hash);

  // Selecting the selected commit again, or "No changes", clears the selection
  const selectCommit = (next: string | undefined, index: number) => {
    const target = next === hash ? undefined : next;
    showCommit(target);
    post({
      type: 'selectCommit',
      hash: target,
      index: target === undefined ? undefined : index,
    });
  };
  // Scrolls to a location's commit, which the extension finds in the history
  const jump = (target: string | undefined) => {
    if (target) {
      post({ type: 'jump', hash: target });
    }
  };
  const selectFile = (next: string | undefined) => {
    if (!hash) {
      return;
    }
    setPath(next);
    post({ type: 'selectFile', hash, path: next });
  };

  return (
    <div className="app">
      <TabBar
        tabs={tabs}
        active={activeTab}
        onSelect={(root) => post({ type: 'selectTab', root })}
        onClose={(root) => post({ type: 'closeTab', root })}
        onAdd={() => post({ type: 'addTab' })}
        onSort={() => post({ type: 'sortTabs' })}
        onLog={log}
      />
      {tabs.length === 0 ? (
        <div className="empty-state">
          No repository is open. Use + to open one.
        </div>
      ) : (
        <ColumnResizingProvider value={columns.resizing}>
          <div
            className="columns"
            ref={columns.container}
            style={{ gridTemplateColumns: columns.template }}
          >
            <Locations
              repository={repository}
              selected={hash}
              onSelect={jump}
            />
            <Commits
              history={history}
              version={historyVersion}
              scrollTarget={scrollTarget}
              onLoad={loadCommits}
              workingTree={workingTree}
              refsByCommit={refsByCommit}
              selected={hash}
              onSelect={selectCommit}
            />
            <Files files={files} selected={path} onSelect={selectFile} />
            <Diff
              workingTree={hash === workingTreeHash}
              commit={commit}
              refs={commit ? (refsByCommit.get(commit.hash) ?? []) : []}
              files={files}
              patch={patch}
              error={error}
            />
          </div>
        </ColumnResizingProvider>
      )}
    </div>
  );
}

function TabBar({
  tabs,
  active,
  onSelect,
  onClose,
  onAdd,
  onSort,
  onLog,
}: {
  tabs: readonly TabInfo[];
  active: string | undefined;
  onSelect: (root: string) => void;
  onClose: (root: string) => void;
  onAdd: () => void;
  onSort: () => void;
  onLog: (message: string) => void;
}) {
  const bar = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);

  // Reports the layout once, to find where space around the page comes from
  useEffect(() => {
    requestAnimationFrame(() => {
      onLog(
        `layout: window ${window.innerWidth}x${window.innerHeight}, ` +
          `dpr ${window.devicePixelRatio}, ` +
          `body ${elementWidth(document.body)}, ` +
          `tab bar ${elementWidth(bar.current)}, ` +
          `tab list ${elementWidth(list.current)}`,
      );
    });
  }, [onLog]);

  // The wheel scrolls the tabs sideways, because their scrollbar is hidden
  const onWheel = (event: React.WheelEvent) => {
    if (list.current && event.deltaY !== 0) {
      list.current.scrollLeft += event.deltaY;
    }
  };

  return (
    <nav className="tabs" ref={bar}>
      <div className="tab-list" ref={list} onWheel={onWheel}>
        {tabs.map((tab) => (
          <div
            key={tab.root}
            className={`tab ${tab.root === active ? 'active' : ''}`}
            title={tab.root}
            onClick={() => onSelect(tab.root)}
            // Stops the browser's middle-button autoscroll, which would
            // otherwise swallow the middle click once the tabs overflow
            onMouseDown={(event) =>
              event.button === 1 && event.preventDefault()
            }
            onAuxClick={(event) => event.button === 1 && onClose(tab.root)}
          >
            <span className="tab-name">{tab.name}</span>
            <button
              className="tab-close"
              title="Close"
              onClick={(event) => {
                event.stopPropagation();
                onClose(tab.root);
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button className="tab-add" title="Open a repository" onClick={onAdd}>
          +
        </button>
      </div>
      <SettingsMenu onSort={onSort} />
    </nav>
  );
}

function elementWidth(element: Element | null): number {
  return element ? Math.round(element.getBoundingClientRect().width) : 0;
}

function SettingsMenu({ onSort }: { onSort: () => void }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="settings" ref={container}>
      <button
        className={`settings-button ${open ? 'open' : ''}`}
        title="Settings"
        onClick={() => setOpen(!open)}
      >
        ⚙
      </button>
      {open && (
        <Menu container={container} onClose={() => setOpen(false)}>
          <button
            className="menu-item"
            role="menuitem"
            onClick={choose(onSort)}
          >
            Sort A-Z
          </button>
        </Menu>
      )}
    </div>
  );
}

// Closes on a click outside the container or on Escape
function Menu({
  container,
  onClose,
  children,
}: {
  container: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (
        !(event.target instanceof Node) ||
        !container.current?.contains(event.target)
      ) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [container, onClose]);

  return (
    <div className="menu" role="menu">
      {children}
    </div>
  );
}

// Columns with an index have a resizer on their right edge
function Column({
  title,
  index,
  children,
}: {
  title: string;
  index?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="column">
      <header className="column-title">{title}</header>
      <div className="column-body">{children}</div>
      {index !== undefined && <Resizer index={index} />}
    </section>
  );
}

// Clicking a location jumps to its commit in the list; the locations pointing
// at the selected commit are highlighted
function Locations({
  repository,
  selected,
  onSelect,
}: {
  repository: Repository | undefined;
  // The selected commit
  selected: string | undefined;
  onSelect: (commit: string | undefined) => void;
}) {
  const refs = repository?.refs ?? [];
  const byKind = (kind: RefInfo['kind']) => refs.filter((r) => r.kind === kind);
  const headCommit = repository?.headCommit;
  return (
    <Column title="Locations" index={0}>
      <div
        className={`row head ${headCommit !== undefined && headCommit === selected ? 'selected' : ''}`}
        onClick={() => onSelect(headCommit)}
      >
        HEAD{repository?.head ? ` (${repository.head})` : ''}
      </div>
      <RefGroup
        title="Branches"
        refs={byKind('branch')}
        selected={selected}
        onSelect={onSelect}
        open
      />
      <RefGroup
        title="Remotes"
        refs={byKind('remote')}
        selected={selected}
        onSelect={onSelect}
      />
      <RefGroup
        title="Tags"
        refs={byKind('tag')}
        selected={selected}
        onSelect={onSelect}
      />
    </Column>
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

function RefGroup({
  title,
  refs,
  selected,
  onSelect,
  open = false,
}: {
  title: string;
  refs: readonly RefInfo[];
  selected: string | undefined;
  onSelect: (commit: string) => void;
  open?: boolean;
}) {
  const tree = useMemo(() => buildTree(refs), [refs]);
  return (
    <TreeFolder
      label={`${title.toUpperCase()} (${refs.length})`}
      node={tree}
      depth={0}
      selected={selected}
      onSelect={onSelect}
      initiallyOpen={open}
      group
    />
  );
}

function TreeFolder({
  label,
  node,
  depth,
  selected,
  onSelect,
  initiallyOpen,
  group = false,
}: {
  label: string;
  node: TreeNode;
  depth: number;
  selected: string | undefined;
  onSelect: (commit: string) => void;
  initiallyOpen: boolean;
  group?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const children = [...node.children.values()].toSorted(
    (a, b) =>
      Number(b.children.size > 0) - Number(a.children.size > 0) ||
      a.name.localeCompare(b.name),
  );
  return (
    <>
      <div
        className={`row tree-row folder ${group ? 'group' : ''}`}
        style={{ paddingLeft: treeIndent(depth) }}
        onClick={() => setOpen(!open)}
      >
        <IndentGuides depth={depth} />
        <span className="twisty">{open ? '▾' : '▸'}</span>
        {label}
      </div>
      {open &&
        children.map((child) =>
          child.children.size > 0 ? (
            <TreeFolder
              key={child.name}
              label={child.name}
              node={child}
              depth={depth + 1}
              selected={selected}
              onSelect={onSelect}
              initiallyOpen={false}
            />
          ) : (
            <div
              key={child.name}
              className={`row tree-row leaf ${child.ref && child.ref.commit === selected ? 'selected' : ''}`}
              // Past the twisty space, so leaves line up with sibling folders
              style={{ paddingLeft: treeIndent(depth + 1) + twistyWidth }}
              title={child.ref?.name}
              onClick={() => child.ref && onSelect(child.ref.commit)}
            >
              <IndentGuides depth={depth + 1} />
              {child.name}
            </div>
          ),
        )}
    </>
  );
}

// Like VS Code's trees: a level is indented by its parent's twisty, and a
// guide runs down from each ancestor's twisty
const treePadding = 8;
const twistyWidth = 10;

function treeIndent(depth: number): number {
  return treePadding + depth * twistyWidth;
}

function IndentGuides({ depth }: { depth: number }) {
  return (
    <>
      {Array.from({ length: depth }, (_, level) => (
        <span
          key={level}
          className="indent-guide"
          style={{ left: treeIndent(level) + twistyWidth / 2 }}
        />
      ))}
    </>
  );
}

function formatDate(time: number): string {
  const date = new Date(time);
  const days = (Date.now() - time) / 86_400_000;
  const clock = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  if (days < 6) {
    return `${date.toLocaleDateString(undefined, { weekday: 'short' })}, ${clock}`;
  }
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function RefBadges({ refs }: { refs: readonly RefInfo[] }) {
  return (
    <>
      {refs.map((r) => (
        <span key={`${r.kind}:${r.name}`} className={`badge ${r.kind}`}>
          {r.name}
        </span>
      ))}
    </>
  );
}

// A row is this high, plus a line per ref pointing at its commit; the ref
// counts arrive with the history, so every row's height, and so the scroll
// position of every commit, is known without loading or measuring it
const commitRowHeight = 50;
const bubbleLineHeight = 20;
// Pages are asked for once scrolling pauses this long, so dragging the
// scrollbar across years doesn't load every page in between
const loadDelay = 80;

// Only the rows on screen are rendered, and the list has the height of the
// whole history from the start, so the scrollbar never changes
function Commits({
  history,
  version,
  scrollTarget,
  onLoad,
  workingTree,
  refsByCommit,
  selected,
  onSelect,
}: {
  history: CommitHistory | undefined;
  // Changes when pages arrive, as the history is filled in place
  version: number;
  scrollTarget: { readonly index: number } | undefined;
  onLoad: (start: number) => void;
  workingTree: number | undefined;
  refsByCommit: Map<string, RefInfo[]>;
  selected: string | undefined;
  onSelect: (hash: string | undefined, index: number) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const hasWorkingTree = workingTree !== undefined;
  const offset = hasWorkingTree ? 1 : 0;
  const count = offset + (history?.total ?? 0);

  const rowHeight = useCallback(
    (index: number) =>
      index < offset
        ? commitRowHeight
        : commitRowHeight +
          (history?.refCountAt(index - offset) ?? 0) * bubbleLineHeight,
    [history, offset],
  );
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => list.current,
    estimateSize: rowHeight,
    overscan: 10,
  });
  // The virtualizer keeps the heights it computed; a new history has new ones
  useEffect(() => virtualizer.measure(), [virtualizer, rowHeight]);
  const rows = virtualizer.getVirtualItems();
  const first = Math.max(0, (rows[0]?.index ?? 0) - offset);
  const last = Math.max(0, (rows.at(-1)?.index ?? 0) - offset);

  useEffect(() => {
    if (!history) {
      return undefined;
    }
    const timer = setTimeout(() => {
      for (const start of history.takeMissingPages(first, last)) {
        onLoad(start);
      }
    }, loadDelay);
    return () => clearTimeout(timer);
  }, [history, first, last, onLoad]);

  // Scrolls to the selected commit or a location's commit, which may be years
  // back; a commit that is already on screen stays where it is
  const scrollIndex = scrollTarget && offset + scrollTarget.index;
  useEffect(() => {
    if (history && scrollIndex !== undefined) {
      const onScreen = virtualizer
        .getVirtualItems()
        .some((row) => row.index === scrollIndex);
      virtualizer.scrollToIndex(scrollIndex, {
        align: onScreen ? 'auto' : 'center',
      });
    }
    // scrollTarget is new for every jump, even to the same commit
  }, [history, scrollTarget, scrollIndex, virtualizer]);

  const selectedPosition =
    selected === workingTreeHash
      ? -1
      : selected === undefined
        ? undefined
        : history?.positionOf(selected);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step =
      event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!step || !history) {
      return;
    }
    event.preventDefault();
    const top = workingTree ? -1 : 0;
    const position = Math.max(
      top,
      Math.min(history.total - 1, (selectedPosition ?? top - 1) + step),
    );
    // At either end, where selecting again would clear the selection
    if (position === selectedPosition) {
      return;
    }
    if (position === -1) {
      onSelect(workingTreeHash, -1);
    } else {
      // Rows that haven't loaded yet can't be selected
      const commit = history.at(position);
      if (!commit) {
        return;
      }
      onSelect(commit.hash, position);
    }
    virtualizer.scrollToIndex(offset + position, { align: 'auto' });
  };

  const renderRow = (index: number) => {
    if (hasWorkingTree && index === 0) {
      return (
        <div
          className={`commit working-tree ${workingTree === 0 ? 'empty' : ''} ${selected === workingTreeHash ? 'selected' : ''}`}
          onClick={() =>
            onSelect(workingTree > 0 ? workingTreeHash : undefined, -1)
          }
        >
          <div className="commit-line">
            <span className="subject">
              {workingTree > 0 ? 'Uncommitted changes' : 'No changes'}
            </span>
            {workingTree > 0 && <span className="count">{workingTree}</span>}
          </div>
          <div className="commit-line secondary">
            <span className="author">
              {workingTree > 0
                ? 'Staged, unstaged and untracked files'
                : 'The working tree is clean'}
            </span>
          </div>
        </div>
      );
    }
    const position = index - offset;
    const commit = history?.at(position);
    if (!commit) {
      return (
        <div className="commit placeholder">
          <div className="commit-line">
            <span className="bar subject-bar" />
          </div>
          <div className="commit-line secondary">
            <span className="bar author-bar" />
          </div>
        </div>
      );
    }
    return (
      <div
        className={`commit ${commit.hash === selected ? 'selected' : ''}`}
        onClick={() => onSelect(commit.hash, position)}
      >
        <div className="commit-line">
          <span className="subject">{commit.subject}</span>
          {commit.files > 0 && <span className="count">{commit.files}</span>}
        </div>
        <div className="commit-line secondary">
          <span className="author">{commit.authorName}</span>
          <span className="date">{formatDate(commit.authorDate)}</span>
        </div>
        {(refsByCommit.get(commit.hash) ?? []).map((ref) => (
          <div key={`${ref.kind}:${ref.name}`} className="bubble-line">
            <span className={`badge ${ref.kind}`} title={ref.name}>
              {ref.name}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Column title="Commits" index={1}>
      <div
        className="list"
        ref={list}
        tabIndex={0}
        onKeyDown={onKeyDown}
        data-version={version}
      >
        <div
          className="list-spacer"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {rows.map((row) => (
            <div
              key={row.key}
              className="list-row"
              style={{
                height: row.size,
                transform: `translateY(${row.start}px)`,
              }}
            >
              {renderRow(row.index)}
            </div>
          ))}
        </div>
      </div>
    </Column>
  );
}

function Files({
  files,
  selected,
  onSelect,
}: {
  files: readonly FileChange[];
  selected: string | undefined;
  onSelect: (path: string | undefined) => void;
}) {
  return (
    <Column title="Files" index={2}>
      {files.length > 0 && (
        <div
          className={`row group ${selected === undefined ? 'selected' : ''}`}
          onClick={() => onSelect(undefined)}
        >
          CHANGES ({files.length})
        </div>
      )}
      {files.map((file) => (
        <div
          key={file.path}
          className={`row file ${file.path === selected ? 'selected' : ''}`}
          title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
          onClick={() =>
            onSelect(file.path === selected ? undefined : file.path)
          }
        >
          <span className={`status status-${file.status}`}>{file.status}</span>
          <span className="path">{file.path}</span>
        </div>
      ))}
    </Column>
  );
}

function Diff({
  workingTree,
  commit,
  refs,
  files,
  patch,
  error,
}: {
  workingTree: boolean;
  commit: CommitInfo | undefined;
  refs: readonly RefInfo[];
  files: readonly FileChange[];
  patch: string;
  error: string | undefined;
}) {
  const diffFiles = useMemo(() => parsePatch(patch), [patch]);
  const stats = useMemo(() => {
    const byPath = new Map(files.map((file) => [file.path, file]));
    const total = files.reduce(
      (sum, file) => ({
        insertions: sum.insertions + file.insertions,
        deletions: sum.deletions + file.deletions,
      }),
      { insertions: 0, deletions: 0 },
    );
    return { byPath, total };
  }, [files]);

  return (
    <Column title="Diff">
      {error && <div className="error">{error}</div>}
      {workingTree && (
        <div className="summary">
          <dl>
            <dt>Changes</dt>
            <dd>Uncommitted changes against HEAD</dd>
            <dt>Stats</dt>
            <dd>
              {files.length} files changed{' '}
              <span className="deletions">-{stats.total.deletions}</span>{' '}
              <span className="insertions">+{stats.total.insertions}</span>
            </dd>
          </dl>
        </div>
      )}
      {commit && (
        <div className="summary">
          <dl>
            <dt>Commit</dt>
            <dd className="mono">{commit.hash}</dd>
            <dt>Author</dt>
            <dd>
              {commit.authorName} &lt;{commit.authorEmail}&gt;
            </dd>
            <dt>Date</dt>
            <dd>{new Date(commit.authorDate).toLocaleString()}</dd>
            <dt>Parents</dt>
            <dd className="mono">
              {commit.parents.map((p) => p.slice(0, 7)).join(', ')}
            </dd>
            {refs.length > 0 && (
              <>
                <dt>Refs</dt>
                <dd>
                  <RefBadges refs={refs} />
                </dd>
              </>
            )}
            <dt>Stats</dt>
            <dd>
              {files.length} files changed{' '}
              <span className="deletions">-{stats.total.deletions}</span>{' '}
              <span className="insertions">+{stats.total.insertions}</span>
            </dd>
          </dl>
          <pre className="message">{commit.message}</pre>
        </div>
      )}
      {diffFiles.map((file) => (
        <FileDiff
          key={file.path}
          file={file}
          change={stats.byPath.get(file.path)}
        />
      ))}
    </Column>
  );
}

function FileDiff({
  file,
  change,
}: {
  file: DiffFile;
  change: FileChange | undefined;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="file-diff">
      <div className="file-header" onClick={() => setOpen(!open)}>
        <span className="twisty">{open ? '▾' : '▸'}</span>
        <span className="path">{file.path}</span>
        {change && (
          <>
            <span className="deletions">-{change.deletions}</span>
            <span className="insertions">+{change.insertions}</span>
          </>
        )}
      </div>
      {open && file.binary && <div className="binary">Binary file</div>}
      {open &&
        file.hunks.map((hunk, index) => (
          <table key={index} className="hunk">
            <tbody>
              <tr className="hunk-header">
                <td colSpan={3}>{hunk.header}</td>
              </tr>
              {hunk.lines.map((line, lineIndex) => (
                <tr key={lineIndex} className={line.kind}>
                  <td className="number">{line.oldNumber}</td>
                  <td className="number">{line.newNumber}</td>
                  <td className="code">{line.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
    </div>
  );
}
