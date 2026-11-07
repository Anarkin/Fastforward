import { useCallback, useEffect, useRef, useState } from 'react';
import { comparedOf, comparisonLabel, sideLabel } from '../shared/comparisons';
import type { Direction, LastFetch, NavigationEntry } from '../shared/protocol';
import {
  onMenuKeyDown,
  useDismiss,
  useMenuFocus,
} from '../../../ui/contextMenu';
import {
  BackIcon,
  ForwardIcon,
  HomeIcon,
  PinIcon,
  RefreshIcon,
} from '../../../ui/icons';
import { fetchStatus } from './fetchStatus';
import { LocationsPopup } from './locations';
import { useGit, useGitActions } from './store';
import { strings } from '../../../shared/strings';
import { useBinding } from '../../../ui/shortcuts';
import { gitKeymap } from '../shared/keymap';

const holdDelay = 400;

const clockTick = 30_000;

function fetchTitle(
  { succeeded, failed }: LastFetch,
  failing: boolean,
  now: number,
): string {
  const since = (time: number) => now - time;
  if (failing && failed !== undefined) {
    return strings.navigation.couldNotFetchTitle(
      since(failed),
      succeeded === undefined ? undefined : since(succeeded),
    );
  }
  return succeeded === undefined
    ? strings.navigation.fetch
    : strings.navigation.fetchedTitle(since(succeeded));
}

function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), clockTick);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function NavButtons() {
  const back = useGit((state) => state.tab.back);
  const forward = useGit((state) => state.tab.forward);
  const fetching = useGit((state) => state.tab.fetching);
  const headCommit = useGit((state) => state.tab.repository?.headCommit);
  const autoFetch = useGit((state) => state.autoFetch);
  const autoFetchMinutes = useGit((state) => state.autoFetchMinutes);
  const lastFetch = useGit((state) => state.lastFetch);
  const {
    navigate: onNavigate,
    jump,
    fetch: onFetch,
    changeAutoFetch: onAutoFetch,
  } = useGitActions();
  const onHome = headCommit === undefined ? undefined : () => jump(headCommit);
  const now = Math.max(
    useNow(),
    lastFetch.succeeded ?? 0,
    lastFetch.failed ?? 0,
  );
  const status = fetchStatus(lastFetch, autoFetch ? autoFetchMinutes : 0, now);
  const title = fetchTitle(lastFetch, status === 'failed', now);
  return (
    <div className="nav-buttons">
      <HistoryButton direction="back" entries={back} onNavigate={onNavigate} />
      <HistoryButton
        direction="forward"
        entries={forward}
        onNavigate={onNavigate}
      />
      <button
        className="nav-button"
        title={strings.actions.head}
        disabled={onHome === undefined}
        onClick={onHome}
      >
        <HomeIcon />
      </button>
      <span
        className={`pin-pair ${autoFetch && autoFetchMinutes > 0 ? 'pinned' : ''}`}
      >
        <button
          className={`nav-button ${fetching ? 'running' : ''}`}
          title={title}
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
            title={strings.navigation.fetchEvery(autoFetchMinutes)}
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
            <span className="menu-check" />
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

export function AddressBar() {
  const open = useGit((state) => state.searching);
  const findsHere = useGit((state) => state.activeColumn === 'commits');
  const { search } = useGitActions();
  const [asked, setAsked] = useState(0);
  useBinding(
    gitKeymap.find,
    () => {
      setAsked((count) => count + 1);
      search(true);
    },
    findsHere,
  );
  const root = useGit((state) => state.tab.root);
  const container = useRef<HTMLDivElement>(null);

  return (
    <div className="address" ref={container}>
      {open && (
        <LocationsPopup
          key={locationsPopupKey(asked, root)}
          anchor={container}
        />
      )}
    </div>
  );
}

export function historyLabel(hash: string): string {
  const compared = comparedOf(hash);
  return compared ? comparisonLabel(compared) : sideLabel(hash);
}
