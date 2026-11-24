import { gitKeymap } from './keymap';
import { keysOf } from '../../../lib/shared/keymap';
import { labelTip } from '../../../lib/page/tips';
import { useEffect, useState } from 'react';
import type { Direction, LastFetch } from '../shared/protocol';
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
import { Toolbar } from '../../../lib/page/toolbar';

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

export function HistoryButton({ direction }: { direction: Direction }) {
  const steps = useGit(
    (state) =>
      (direction === 'back' ? state.tab.back : state.tab.forward).length,
  );
  const { navigate: onNavigate } = useGitActions();
  return (
    <button
      className="nav-button"
      {...labelTip(strings.navigation.history[direction], {
        keys: keysOf(gitKeymap.navigate, direction),
      })}
      disabled={steps === 0}
      onClick={() => onNavigate(direction, 1)}
    >
      {direction === 'back' ? <BackIcon /> : <ForwardIcon />}
    </button>
  );
}
