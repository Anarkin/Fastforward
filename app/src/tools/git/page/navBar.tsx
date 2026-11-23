import { gitKeymap } from './keymap';
import { keysOf } from '../../../lib/shared/keymap';
import { labelTip, tip } from '../../../lib/page/tips';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Direction, LastFetch, NavigationEntry } from '../shared/protocol';
import { onMenuKeyDown, useMenuFocus } from '../../../lib/page/menuControls';
import { useDismiss } from '../../../lib/page/dismiss';
import {
  BackIcon,
  ForwardIcon,
  HomeIcon,
  PinIcon,
  RefreshIcon,
} from '../../../lib/page/icons';
import { fetchStatus } from './fetchStatus';
import { useGit, useGitActions } from './store';
import { strings } from '../../../lib/shared/strings';
import {
  historyButtonClick,
  nextHistoryOpen,
  historyLabel,
} from './navHistory';
import { Toolbar } from '../../../lib/page/toolbar';

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
  const fetching = useGit((state) => state.tab.fetching);
  const headCommit = useGit((state) => state.tab.repository?.headCommit);
  const autoFetch = useGit((state) => state.autoFetch);
  const autoFetchMinutes = useGit((state) => state.autoFetchMinutes);
  const lastFetch = useGit((state) => state.lastFetch);
  const {
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
    <Toolbar>
      <HistoryButton direction="back" />
      <HistoryButton direction="forward" />
      <button
        className="nav-button"
        {...labelTip(strings.actions.head, { keys: keysOf(gitKeymap.head) })}
        disabled={onHome === undefined}
        onClick={onHome}
      >
        <HomeIcon />
      </button>
      <Toolbar className="pin-pair">
        <button
          className={`nav-button ${fetching ? 'running' : ''}`}
          {...labelTip(title)}
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
        <button
          className={`nav-button toggle ${autoFetch ? 'active' : ''}`}
          {...labelTip(strings.navigation.fetchEvery(autoFetchMinutes))}
          aria-pressed={autoFetch}
          disabled={autoFetchMinutes === 0}
          onClick={() => onAutoFetch(!autoFetch)}
        >
          <PinIcon />
        </button>
      </Toolbar>
    </Toolbar>
  );
}

function HistoryButton({ direction }: { direction: Direction }) {
  const entries = useGit((state) =>
    direction === 'back' ? state.tab.back : state.tab.forward,
  );
  const { navigate: onNavigate } = useGitActions();
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
        {...labelTip(strings.navigation.history[direction], {
          keys: keysOf(gitKeymap.navigate, direction),
        })}
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
            {...tip(entry.hash)}
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
