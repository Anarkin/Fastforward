import { useCallback, useEffect, useRef, useState } from 'react';
import { comparedOf, comparisonLabel, sideLabel } from '../shared/comparisons';
import type {
  Bookmark,
  Direction,
  LastFetch,
  NavigationEntry,
  RepositoryState,
  ToWebviewOf,
} from '../shared/protocol';
import { onMenuKeyDown, useDismiss, useMenuFocus } from './contextMenu';
import { BackIcon, ForwardIcon, PinIcon, RefreshIcon } from './icons';
import { fetchStatus } from './fetchStatus';
import { LocationsPopup } from './locations';
import { keymap } from '../shared/keymap';
import { strings } from '../shared/strings';
import { useBinding } from './shortcuts';

const holdDelay = 400;

const clockTick = 30_000;

function autoFetchTitle(on: boolean, minutes: number): string {
  return on
    ? strings.navigation.stopFetchingEvery(minutes)
    : strings.navigation.fetchEvery(minutes);
}

function lastFetchText(
  { succeeded, failed }: LastFetch,
  failing: boolean,
  now: number,
): string | undefined {
  const since = (time: number) => now - time;
  if (failing && failed !== undefined) {
    return strings.navigation.couldNotFetch(
      since(failed),
      succeeded === undefined ? undefined : since(succeeded),
    );
  }
  return succeeded === undefined
    ? undefined
    : strings.navigation.fetched(since(succeeded));
}

function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), clockTick);
    return () => clearInterval(timer);
  }, []);
  return now;
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
  lastFetch,
}: {
  back: readonly NavigationEntry[];
  forward: readonly NavigationEntry[];
  onNavigate: (direction: Direction, steps: number) => void;
  fetching: boolean;
  onFetch: () => void;
  autoFetch: boolean;
  autoFetchMinutes: number;
  onAutoFetch: (on: boolean) => void;
  lastFetch: LastFetch;
}) {
  const now = Math.max(
    useNow(),
    lastFetch.succeeded ?? 0,
    lastFetch.failed ?? 0,
  );
  const status = fetchStatus(lastFetch, autoFetch ? autoFetchMinutes : 0, now);
  const fetchedText = lastFetchText(lastFetch, status === 'failed', now);
  return (
    <div className="nav-buttons">
      <HistoryButton direction="back" entries={back} onNavigate={onNavigate} />
      <HistoryButton
        direction="forward"
        entries={forward}
        onNavigate={onNavigate}
      />
      <span
        className={`pin-pair ${autoFetch && autoFetchMinutes > 0 ? 'pinned' : ''}`}
      >
        <button
          className={`nav-button ${fetching ? 'running' : ''}`}
          title={
            fetchedText === undefined
              ? strings.navigation.fetch
              : `${strings.navigation.fetch}\n${fetchedText}`
          }
          disabled={fetching}
          onClick={onFetch}
        >
          <span className="spin-icon">
            <RefreshIcon />
          </span>
          {!fetching && (status === 'stale' || status === 'failed') && (
            <span className={`fetch-mark ${status}`} />
          )}
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
      </span>
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

  return (
    <div className="history-button" ref={container}>
      <button
        className="nav-button"
        title={strings.navigation.history[direction]}
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
  const menu = useRef<HTMLDivElement>(null);
  useDismiss(container, onClose);
  useMenuFocus(menu);
  return (
    <div
      className="menu history-menu"
      role="menu"
      ref={menu}
      onKeyDown={(event) => onMenuKeyDown(event)}
    >
      {entries.map((entry, index) => (
        <div key={index} className="menu-entry">
          <button
            className="menu-item history-item"
            role="menuitem"
            title={entry.hash}
            onMouseEnter={(event) => event.currentTarget.focus()}
            onClick={() => onPick(index + 1)}
          >
            <span className="history-hash">{historyLabel(entry.hash)}</span>
            {entry.subject}
          </button>
        </div>
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
  useBinding(keymap.search, () => {
    setOpen(true);
    setSearches((count) => count + 1);
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
        title={strings.actions.search}
        onClick={() => setOpen(true)}
      >
        <span className="address-text empty">{strings.search.placeholder}</span>
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

export function historyLabel(hash: string): string {
  const compared = comparedOf(hash);
  return compared ? comparisonLabel(compared) : sideLabel(hash);
}
