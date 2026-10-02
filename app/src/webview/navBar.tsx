import { useCallback, useRef, useState } from 'react';
import { shortHash } from '../shared/hashes';
import type {
  Bookmark,
  Direction,
  NavigationEntry,
  RepositoryState,
  ToWebviewOf,
} from '../shared/protocol';
import { useDismiss } from './contextMenu';
import { BackIcon, ForwardIcon, PinIcon, RefreshIcon } from './icons';
import { LocationsPopup } from './locations';
import { useShortcuts } from './shortcuts';

const holdDelay = 400;

function autoFetchTitle(on: boolean, minutes: number): string {
  const every = minutes === 1 ? 'every minute' : `every ${minutes} minutes`;
  return on
    ? `Fetching ${every}; unpin to stop`
    : `Pin: fetch every repository ${every}`;
}

export function NavButtons({
  back,
  forward,
  onNavigate,
  fetching,
  onFetch,
  autoFetch,
  autoFetchMinutes,
  onAutoFetch,
}: {
  back: readonly NavigationEntry[];
  forward: readonly NavigationEntry[];
  onNavigate: (direction: Direction, steps: number) => void;
  fetching: boolean;
  onFetch: () => void;
  autoFetch: boolean;
  autoFetchMinutes: number;
  onAutoFetch: (on: boolean) => void;
}) {
  return (
    <div className="nav-buttons">
      <HistoryButton direction="back" entries={back} onNavigate={onNavigate} />
      <HistoryButton
        direction="forward"
        entries={forward}
        onNavigate={onNavigate}
      />
      <button
        className={`nav-button ${fetching ? 'running' : ''}`}
        title="Fetch every remote, dropping branches deleted there"
        disabled={fetching}
        onClick={onFetch}
      >
        <span className="spin-icon">
          <RefreshIcon />
        </span>
      </button>
      {autoFetchMinutes > 0 && (
        <button
          className={`nav-button toggle ${autoFetch ? 'active' : ''}`}
          title={autoFetchTitle(autoFetch, autoFetchMinutes)}
          aria-pressed={autoFetch}
          onClick={() => onAutoFetch(!autoFetch)}
        >
          <PinIcon />
        </button>
      )}
    </div>
  );
}

export function historyButtonClick(
  held: boolean,
  open: boolean,
): 'none' | 'close' | 'step' {
  if (held) {
    return 'none';
  }
  return open ? 'close' : 'step';
}

export function nextHistoryOpen(open: boolean, entries: number): boolean {
  return open && entries > 0;
}

function HistoryButton({
  direction,
  entries,
  onNavigate,
}: {
  direction: Direction;
  entries: readonly NavigationEntry[];
  onNavigate: (direction: Direction, steps: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const next = nextHistoryOpen(open, entries.length);
  if (next !== open) {
    setOpen(next);
  }
  const container = useRef<HTMLDivElement>(null);
  const hold = useRef<ReturnType<typeof setTimeout>>(undefined);
  const held = useRef(false);
  const close = useCallback(() => {
    held.current = false;
    setOpen(false);
  }, []);
  const label = direction === 'back' ? 'Back' : 'Forward';

  return (
    <div className="history-button" ref={container}>
      <button
        className="nav-button"
        title={`${label}; hold or right-click for the history`}
        disabled={entries.length === 0}
        onPointerDown={() => {
          held.current = false;
          clearTimeout(hold.current);
          hold.current = setTimeout(() => {
            held.current = true;
            setOpen(true);
          }, holdDelay);
        }}
        onPointerUp={() => clearTimeout(hold.current)}
        onPointerLeave={() => clearTimeout(hold.current)}
        onClick={() => {
          const click = historyButtonClick(held.current, open);
          held.current = false;
          if (click === 'close') {
            close();
          } else if (click === 'step') {
            onNavigate(direction, 1);
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
      >
        {direction === 'back' ? <BackIcon /> : <ForwardIcon />}
      </button>
      {next && (
        <HistoryMenu
          container={container}
          entries={entries}
          onPick={(steps) => {
            close();
            onNavigate(direction, steps);
          }}
          onClose={close}
        />
      )}
    </div>
  );
}

export function HistoryMenu({
  container,
  entries,
  onPick,
  onClose,
}: {
  container: React.RefObject<HTMLElement | null>;
  entries: readonly NavigationEntry[];
  onPick: (steps: number) => void;
  onClose: () => void;
}) {
  useDismiss(container, onClose);
  return (
    <div className="menu history-menu" role="menu">
      {entries.map((entry, index) => (
        <button
          key={index}
          className="menu-item history-item"
          role="menuitem"
          title={entry.hash}
          onClick={() => onPick(index + 1)}
        >
          <span className="history-hash">{shortHash(entry.hash)}</span>
          {entry.subject}
        </button>
      ))}
    </div>
  );
}

export function locationsPopupKey(
  searches: number,
  root: string | undefined,
): string {
  return `${searches}\n${root ?? ''}`;
}

export function AddressBar({
  root,
  repository,
  hashLookup,
  onLookupHash,
  commitSearch,
  onSearchCommits,
  onJump,
  bookmarks,
}: {
  root: string | undefined;
  bookmarks: readonly Bookmark[];
  hashLookup: ToWebviewOf<'hashLookup'> | undefined;
  onLookupHash: (query: string) => void;
  commitSearch: ToWebviewOf<'commitSearch'> | undefined;
  onSearchCommits: (query: string) => void;
  repository: RepositoryState | undefined;
  onJump: (commit: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const [searches, setSearches] = useState(0);
  useShortcuts({
    s: () => {
      setOpen(true);
      setSearches((count) => count + 1);
    },
  });
  const [queries, setQueries] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  const query = (root && queries.get(root)) ?? '';
  const setQuery = (next: string) =>
    root && setQueries((all) => new Map(all).set(root, next));
  const container = useRef<HTMLDivElement>(null);

  return (
    <div className="address" ref={container}>
      <button
        className="address-bar"
        title="Search branches, remotes, tags and commits"
        onClick={() => setOpen(true)}
      >
        <span className="address-text empty">Search…</span>
      </button>
      {open && (
        <LocationsPopup
          key={locationsPopupKey(searches, root)}
          repository={repository}
          anchor={container}
          lookup={hashLookup}
          onLookup={onLookupHash}
          commitSearch={commitSearch}
          onSearchCommits={onSearchCommits}
          onJump={onJump}
          onClose={close}
          query={query}
          onQuery={setQuery}
          bookmarks={bookmarks}
        />
      )}
    </div>
  );
}
