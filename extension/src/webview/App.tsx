import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  workingTreeHash,
  type CommitInfo,
  type CheckoutTarget,
  type FileChange,
  type FilesMode,
  type RefInfo,
  type TabInfo,
  type ToExtension,
  type ToWebview,
  type VipRef,
} from '../protocol';
import { CommitHistory, commitPageSize } from './commitHistory';
import { ColumnResizingProvider, Resizer, useColumnWidths } from './columns';
import { parsePatch, type DiffFile } from './diff';
import {
  ContextMenu,
  OpenContextMenu,
  sameRef,
  useContextMenu,
  type ContextMenuItem,
  type MenuTarget,
  type OpenMenu,
} from './contextMenu';
import { FileTree, foldersOf } from './fileTree';
import { GraphCell, graphWidth, rowLanes } from './graph';
import { LocationsPopup, type Repository } from './locations';
import { shownVips } from './vips';
import { checkoutOptions, checkoutRef } from './checkout';

interface Props {
  post: (message: ToExtension) => void;
}

// A position to scroll the commit list to; a new object scrolls again even to
// the same position
interface ScrollTarget {
  readonly index: number;
  // Pixels scrolled into that row, to put it exactly where it was
  readonly offset?: number;
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
  // Sublime Merge's setting, on by default
  const [collapseMerges, setCollapseMerges] = useState(true);
  const [filesMode, setFilesMode] = useState<FilesMode>('changes');
  // Every file of the repository at the selected commit, for the Files view
  const [tree, setTree] = useState<{
    hash: string;
    paths: readonly string[];
  }>();
  // Open folders of the Files view, kept while moving between commits
  const [openFolders, setOpenFolders] = useState<ReadonlySet<string>>(
    new Set(),
  );
  // A file the commit didn't change, shown whole in the Diff column
  const [fileContent, setFileContent] = useState<{
    path: string;
    content: string;
    binary: boolean;
  }>();
  // Refs pinned to the VIP row, saved per repository
  const [vips, setVips] = useState<readonly VipRef[]>([]);
  const [menu, setMenu] = useState<OpenMenu>();
  const closeMenu = useCallback(() => setMenu(undefined), []);
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
          setCollapseMerges(message.collapseMerges);
          setFilesMode(message.filesMode);
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
          const next = new CommitHistory(
            message.total,
            message.decorations,
            message.graphWidth,
          );
          next.add(message.start, message.commits, message.graph);
          historyRef.current = next;
          setHistory(next);
          // A reload keeps the list where it was; otherwise it shows the
          // selected commit
          setScrollTarget(
            message.anchor ??
              (message.selectedIndex === undefined
                ? undefined
                : { index: message.selectedIndex }),
          );
          break;
        }
        case 'commitPage':
          historyRef.current?.add(
            message.start,
            message.commits,
            message.graph,
          );
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
          setFileContent(undefined);
          break;
        case 'fileContent':
          setHash(message.hash);
          setPath(message.path);
          setPatch('');
          setFileContent(message);
          break;
        case 'tree':
          setTree(message);
          break;
        case 'vips':
          setVips(message.vips);
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
    setFileContent(undefined);
  }

  const log = useCallback(
    (message: string) => post({ type: 'log', level: 'info', message }),
    [post],
  );

  const onScrolled = useCallback(
    (top: string, offset: number) =>
      post({ type: 'scrolled', hash: top, offset }),
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

  // The Files view needs every file of the repository at the selected commit
  useEffect(() => {
    if (filesMode === 'files' && hash && tree?.hash !== hash) {
      post({ type: 'loadTree', hash });
    }
  }, [filesMode, hash, tree, post]);

  // The selected file's folders open, so it is visible in the Files view
  useEffect(() => {
    if (filesMode !== 'files' || path === undefined) {
      return;
    }
    const folders = foldersOf(path);
    setOpenFolders((open) =>
      folders.every((folder) => open.has(folder))
        ? open
        : new Set([...open, ...folders]),
    );
  }, [filesMode, path]);

  const toggleFolder = (folder: string) =>
    setOpenFolders((open) => {
      const next = new Set(open);
      if (!next.delete(folder)) {
        next.add(folder);
      }
      return next;
    });

  const changeFilesMode = (mode: FilesMode) => {
    setFilesMode(mode);
    post({ type: 'setFilesMode', mode });
  };

  const changeVips = (next: readonly VipRef[]) => {
    setVips(next);
    post({ type: 'setVips', vips: next });
  };

  // The items of the menu for what was right-clicked; commits have none yet
  const checkout = (target: CheckoutTarget) =>
    post({ type: 'checkout', target });

  const menuItems = (target: MenuTarget): ContextMenuItem[] => {
    const refs = repository?.refs ?? [];
    const head = repository?.head;
    if (target.kind === 'commit') {
      const detached = repository && !head ? repository.headCommit : undefined;
      return [
        {
          label: 'Checkout',
          submenu: checkoutOptions(target.hash, refs, head, detached).map(
            (option) => ({
              label: option.label,
              disabled: option.disabled,
              onClick: () => checkout(option.target),
            }),
          ),
        },
      ];
    }
    const isVip = vips.some((vip) => sameRef(vip, target.ref));
    const option = checkoutRef(target.ref, refs, head);
    return [
      {
        label: 'Checkout',
        disabled: option.disabled,
        onClick: () => checkout(option.target),
      },
      { separator: true },
      isVip
        ? {
            label: 'Remove from VIP',
            onClick: () =>
              changeVips(vips.filter((vip) => !sameRef(vip, target.ref))),
          }
        : {
            label: 'Add VIP',
            onClick: () => changeVips([...vips, target.ref]),
          },
    ];
  };

  const openMenu = (event: React.MouseEvent, target: MenuTarget) => {
    // Only the innermost target, like a bubble inside a commit row
    event.stopPropagation();
    const items = menuItems(target);
    if (items.length > 0) {
      event.preventDefault();
      setMenu({ x: event.clientX, y: event.clientY, items });
    }
  };

  return (
    <OpenContextMenu.Provider value={openMenu}>
      <CheckedOutBranch.Provider value={repository?.head}>
        <DetachedHead.Provider
          value={
            repository && !repository.head ? repository.headCommit : undefined
          }
        >
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
            {tabs.length > 0 && (
              <BubbleBar
                repository={repository}
                selected={hash}
                vips={vips}
                onJump={jump}
              />
            )}
            {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
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
                  <Commits
                    history={history}
                    version={historyVersion}
                    scrollTarget={scrollTarget}
                    onScrolled={onScrolled}
                    onLoad={loadCommits}
                    workingTree={workingTree}
                    refsByCommit={refsByCommit}
                    selected={hash}
                    onSelect={selectCommit}
                    onToggleMerge={(merge) =>
                      post({ type: 'toggleMerge', hash: merge })
                    }
                    collapseMerges={collapseMerges}
                    onCollapseMerges={(collapse) => {
                      setCollapseMerges(collapse);
                      post({ type: 'setCollapseMerges', collapse });
                    }}
                  />
                  <Files
                    mode={filesMode}
                    onMode={changeFilesMode}
                    files={files}
                    tree={
                      hash !== undefined && tree?.hash === hash
                        ? tree.paths
                        : undefined
                    }
                    openFolders={openFolders}
                    onToggleFolder={toggleFolder}
                    selected={path}
                    onSelect={selectFile}
                  />
                  <Diff
                    workingTree={hash === workingTreeHash}
                    commit={commit}
                    refs={commit ? (refsByCommit.get(commit.hash) ?? []) : []}
                    files={files}
                    patch={patch}
                    fileContent={
                      fileContent?.path === path ? fileContent : undefined
                    }
                    error={error}
                  />
                </div>
              </ColumnResizingProvider>
            )}
          </div>
        </DetachedHead.Provider>
      </CheckedOutBranch.Provider>
    </OpenContextMenu.Provider>
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
      <MenuButton
        title="Settings"
        items={[{ label: 'Sort A-Z', onClick: onSort }]}
      />
    </nav>
  );
}

function elementWidth(element: Element | null): number {
  return element ? Math.round(element.getBoundingClientRect().width) : 0;
}

interface MenuItem {
  readonly label: string;
  // Shows a check mark when set, for items that switch something on and off
  readonly checked?: boolean;
  readonly onClick: () => void;
}

// A gear that opens a dropdown menu
function MenuButton({
  title,
  items,
}: {
  title: string;
  items: readonly MenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  return (
    <div className="settings" ref={container}>
      <button
        className={`settings-button ${open ? 'open' : ''}`}
        title={title}
        onClick={() => setOpen(!open)}
      >
        ⚙
      </button>
      {open && (
        <Menu container={container} onClose={() => setOpen(false)}>
          {items.map((item) => (
            <button
              key={item.label}
              className="menu-item"
              role={
                item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'
              }
              aria-checked={item.checked}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.checked !== undefined && (
                <span className="menu-check">{item.checked ? '✓' : ''}</span>
              )}
              {item.label}
            </button>
          ))}
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

// Columns with an index have a resizer on their right edge; actions sit on the
// right of the title
function Column({
  title,
  index,
  actions,
  children,
}: {
  title: React.ReactNode;
  index?: number;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="column">
      <header className="column-title">
        {title}
        {actions && <div className="column-actions">{actions}</div>}
      </header>
      <div className="column-body">{children}</div>
      {index !== undefined && <Resizer index={index} />}
    </section>
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
        <RefBubble key={`${r.kind}:${r.name}`} info={r} />
      ))}
    </>
  );
}

// The name of the branch HEAD is on, whose bubbles stand out everywhere
const CheckedOutBranch = createContext<string | undefined>(undefined);
// The commit HEAD points at when no branch is checked out
const DetachedHead = createContext<string | undefined>(undefined);

// A detached HEAD, as a bubble with the commit's short hash, in the colors of
// the checked-out branch
function HeadBubble({
  commit,
  onClick,
}: {
  commit: string;
  onClick?: () => void;
}) {
  return (
    <span
      className={`badge head checked-out ${onClick ? 'clickable' : ''}`}
      title={`HEAD is detached at ${commit}`}
      onClick={onClick}
    >
      HEAD {commit.slice(0, 7)}
    </span>
  );
}

// A branch, remote or tag bubble, with its menu on right-click
function RefBubble({
  info,
  missing = false,
  onClick,
}: {
  info: VipRef;
  // A VIP whose ref doesn't exist anymore
  missing?: boolean;
  onClick?: () => void;
}) {
  const menu = useContextMenu({
    kind: 'ref',
    ref: { kind: info.kind, name: info.name },
  });
  const checkedOut =
    info.kind === 'branch' && info.name === useContext(CheckedOutBranch);
  return (
    <span
      className={`badge ${info.kind} ${checkedOut ? 'checked-out' : ''} ${missing ? 'missing' : ''} ${onClick ? 'clickable' : ''}`}
      title={
        missing
          ? `${info.name} doesn't exist anymore`
          : checkedOut
            ? `${info.name}, checked out`
            : info.name
      }
      onClick={onClick}
      {...menu}
    >
      {info.name}
    </span>
  );
}

// The row under the tabs: the Locations button, which opens every branch,
// remote and tag in a popup, then the repository's VIPs, sorted; clicking one
// jumps to it
function BubbleBar({
  repository,
  selected,
  vips,
  onJump,
}: {
  repository: Repository | undefined;
  selected: string | undefined;
  vips: readonly VipRef[];
  onJump: (commit: string) => void;
}) {
  const [locationsOpen, setLocationsOpen] = useState(false);
  // Kept while the popup is closed, and while switching tabs
  const [locationsQuery, setLocationsQuery] = useState('');
  const button = useRef<HTMLButtonElement>(null);
  const closeLocations = useCallback(() => setLocationsOpen(false), []);
  const refs = repository?.refs ?? [];
  const detached = useContext(DetachedHead);
  return (
    <div className="bubble-bar">
      <button
        ref={button}
        className={`locations-button ${locationsOpen ? 'open' : ''}`}
        title="Branches, remotes and tags"
        onClick={() => setLocationsOpen(!locationsOpen)}
      >
        ⎇ Locations ▾
      </button>
      {locationsOpen && (
        <LocationsPopup
          repository={repository}
          selected={selected}
          anchor={button}
          onJump={onJump}
          onClose={closeLocations}
          query={locationsQuery}
          onQuery={setLocationsQuery}
        />
      )}
      {detached && (
        <HeadBubble commit={detached} onClick={() => onJump(detached)} />
      )}
      {shownVips(vips, refs, repository?.head, repository?.headUpstream).map(
        (vip) => {
          const ref = refs.find((r) => sameRef(r, vip));
          return (
            <RefBubble
              key={`${vip.kind}:${vip.name}`}
              info={vip}
              missing={!ref}
              onClick={ref && (() => onJump(ref.commit))}
            />
          );
        },
      )}
    </div>
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
  onScrolled,
  onLoad,
  workingTree,
  refsByCommit,
  selected,
  onSelect,
  onToggleMerge,
  collapseMerges,
  onCollapseMerges,
}: {
  history: CommitHistory | undefined;
  // Changes when pages arrive, as the history is filled in place
  version: number;
  scrollTarget: ScrollTarget | undefined;
  // The commit at the top of the list once scrolling stops
  onScrolled: (hash: string, offset: number) => void;
  onLoad: (start: number) => void;
  workingTree: number | undefined;
  refsByCommit: Map<string, RefInfo[]>;
  selected: string | undefined;
  onSelect: (hash: string | undefined, index: number) => void;
  onToggleMerge: (hash: string) => void;
  collapseMerges: boolean;
  onCollapseMerges: (collapse: boolean) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const openMenu = useContext(OpenContextMenu);
  const detached = useContext(DetachedHead);
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
    if (!history || scrollIndex === undefined) {
      return;
    }
    // A reload puts the commit that was at the top back at the top
    const rowOffset = scrollTarget?.offset;
    if (rowOffset !== undefined) {
      const [start] = virtualizer.getOffsetForIndex(scrollIndex, 'start') ?? [];
      if (start !== undefined) {
        virtualizer.scrollToOffset(start + rowOffset);
      }
      return;
    }
    const onScreen = virtualizer
      .getVirtualItems()
      .some((row) => row.index === scrollIndex);
    virtualizer.scrollToIndex(scrollIndex, {
      align: onScreen ? 'auto' : 'center',
    });
    // scrollTarget is new for every jump, even to the same commit
  }, [history, scrollTarget, scrollIndex, virtualizer]);

  // Tells the extension which commit is at the top once scrolling stops, so a
  // reload can keep it there
  useEffect(() => {
    const element = list.current;
    if (!element) {
      return undefined;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const top = element.scrollTop;
        const row = virtualizer.getVirtualItems().find((r) => r.end > top);
        const commit = row && history?.at(row.index - offset);
        if (row && commit) {
          onScrolled(commit.hash, top - row.start);
        }
      }, 150);
    };
    element.addEventListener('scroll', onScroll);
    return () => {
      clearTimeout(timer);
      element.removeEventListener('scroll', onScroll);
    };
  }, [history, offset, onScrolled, virtualizer]);

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

  const renderGraph = (index: number, height: number) => {
    const graphRow = history?.graphAt(index - offset);
    return (
      graphRow && (
        <GraphCell
          row={graphRow}
          height={height}
          onToggleMerge={() => {
            const commit = history?.at(index - offset);
            if (commit) {
              onToggleMerge(commit.hash);
            }
          }}
        />
      )
    );
  };

  // Each row's text starts right after the lanes it draws in; the working tree
  // row lines up with the first commit
  const indent = (index: number) =>
    graphWidth(rowLanes(history?.graphAt(Math.max(0, index - offset)))) + 8;

  const renderRow = (index: number) => {
    if (hasWorkingTree && index === 0) {
      return (
        <div
          style={{ paddingLeft: indent(index) }}
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
        <div
          className="commit placeholder"
          style={{ paddingLeft: indent(index) }}
        >
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
        style={{ paddingLeft: indent(index) }}
        onClick={() => onSelect(commit.hash, position)}
        // No items yet; bubbles in the row open their own menu first
        onContextMenu={(event) =>
          openMenu(event, { kind: 'commit', hash: commit.hash })
        }
      >
        <div className="commit-line">
          <span className="subject">{commit.subject}</span>
          {commit.files > 0 && <span className="count">{commit.files}</span>}
        </div>
        <div className="commit-line secondary">
          <span className="author">{commit.authorName}</span>
          <span className="date">{formatDate(commit.authorDate)}</span>
        </div>
        {detached === commit.hash && (
          <div className="bubble-line">
            <HeadBubble commit={commit.hash} />
          </div>
        )}
        {(refsByCommit.get(commit.hash) ?? []).map((ref) => (
          <div key={`${ref.kind}:${ref.name}`} className="bubble-line">
            <RefBubble info={ref} />
          </div>
        ))}
      </div>
    );
  };

  return (
    <Column
      title="Commits"
      index={0}
      actions={
        <MenuButton
          title="Commit list settings"
          items={[
            {
              label: 'Collapse merge commits',
              checked: collapseMerges,
              onClick: () => onCollapseMerges(!collapseMerges),
            },
          ]}
        />
      }
    >
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
              {renderGraph(row.index, row.size)}
              {renderRow(row.index)}
            </div>
          ))}
        </div>
      </div>
    </Column>
  );
}

// The selected commit's changes, or every file of the repository at it
function Files({
  mode,
  onMode,
  files,
  tree,
  openFolders,
  onToggleFolder,
  selected,
  onSelect,
}: {
  mode: FilesMode;
  onMode: (mode: FilesMode) => void;
  files: readonly FileChange[];
  // Undefined while it loads
  tree: readonly string[] | undefined;
  openFolders: ReadonlySet<string>;
  onToggleFolder: (folder: string) => void;
  selected: string | undefined;
  onSelect: (path: string | undefined) => void;
}) {
  const changes = useMemo(
    () => new Map(files.map((file) => [file.path, file])),
    [files],
  );
  const title = (
    <div className="switch" role="tablist">
      {(['changes', 'files'] as const).map((option) => (
        <button
          key={option}
          role="tab"
          aria-selected={mode === option}
          className={`switch-option ${mode === option ? 'active' : ''}`}
          onClick={() => onMode(option)}
        >
          {option === 'changes' ? 'Changes' : 'Files'}
        </button>
      ))}
    </div>
  );
  if (mode === 'files') {
    return (
      <Column title={title} index={1}>
        {tree && (
          <FileTree
            paths={tree}
            changes={changes}
            selected={selected}
            expanded={openFolders}
            onToggle={onToggleFolder}
            onSelect={onSelect}
          />
        )}
      </Column>
    );
  }
  return (
    <Column title={title} index={1}>
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
  fileContent,
  error,
}: {
  workingTree: boolean;
  commit: CommitInfo | undefined;
  refs: readonly RefInfo[];
  files: readonly FileChange[];
  patch: string;
  // A file the commit didn't change, shown whole instead of a diff
  fileContent: { path: string; content: string; binary: boolean } | undefined;
  error: string | undefined;
}) {
  const diffFiles = useMemo(() => parsePatch(patch), [patch]);
  const detached = useContext(DetachedHead);
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
            {(refs.length > 0 || detached === commit.hash) && (
              <>
                <dt>Refs</dt>
                <dd>
                  {detached === commit.hash && (
                    <HeadBubble commit={commit.hash} />
                  )}
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
      {fileContent && <FileView file={fileContent} />}
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

// A whole file with line numbers, for a file the commit didn't change
function FileView({
  file,
}: {
  file: { path: string; content: string; binary: boolean };
}) {
  const lines = useMemo(
    () => file.content.replace(/\n$/, '').split('\n'),
    [file.content],
  );
  return (
    <div className="file-diff">
      <div className="file-header">
        <span className="path">{file.path}</span>
        <span className="unchanged">Unchanged in this commit</span>
      </div>
      {file.binary ? (
        <div className="binary">Binary or very large file</div>
      ) : (
        <table className="hunk">
          <tbody>
            {lines.map((line, index) => (
              <tr key={index}>
                <td className="number">{index + 1}</td>
                <td className="code">{line}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
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
