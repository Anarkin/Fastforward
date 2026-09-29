import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { shortHash } from '../shared/hashes';
import type {
  Direction,
  HashLookup,
  NavigationEntry,
  RepositoryState,
} from '../shared/protocol';
import { CommitDetails, type CardCommit } from './commitCard';
import { useDismiss } from './contextMenu';
import { BackIcon, ForwardIcon, HelpIcon, RefreshIcon } from './icons';
import { LocationsPopup, usePopupHeight } from './locations';
import { shortcuts, useShortcuts } from './shortcuts';

const holdDelay = 400;

export function NavBar({
  root,
  back,
  forward,
  onNavigate,
  fetching,
  onFetch,
  address,
  repository,
  selected,
  hashLookup,
  onLookupHash,
  onJump,
}: {
  root: string | undefined;
  hashLookup: { query: string; result: HashLookup } | undefined;
  onLookupHash: (query: string) => void;
  back: readonly NavigationEntry[];
  forward: readonly NavigationEntry[];
  onNavigate: (direction: Direction, steps: number) => void;
  fetching: boolean;
  onFetch: () => void;
  address: Address;
  repository: RepositoryState | undefined;
  selected: string | undefined;
  onJump: (commit: string) => void;
}) {
  return (
    <div className="nav-bar">
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
        <span className="fetch-arrow">
          <RefreshIcon />
        </span>
      </button>
      <AddressBar
        root={root}
        address={address}
        repository={repository}
        selected={selected}
        hashLookup={hashLookup}
        onLookupHash={onLookupHash}
        onJump={onJump}
      />
      <div className="nav-end">
        <ShortcutsHelp />
      </div>
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
      {open && entries.length > 0 && (
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
          {entry.subject ?? ''}
        </button>
      ))}
    </div>
  );
}

export interface Address {
  readonly hash: string | undefined;
  readonly subject: string | undefined;
  readonly commit: CardCommit | undefined;
}

const peekDelay = 300;
const unpeekDelay = 200;

export type PeekMode = 'closed' | 'peek' | 'pinned' | 'open';

function isPeek(mode: PeekMode): boolean {
  return mode === 'peek' || mode === 'pinned';
}

export function nextPeekMode(
  mode: PeekMode,
  action: 'rest' | 'leave' | 'toggle' | 'update',
  canPeek: boolean,
): PeekMode {
  if (!canPeek) {
    return isPeek(mode) ? 'closed' : mode;
  }
  switch (action) {
    case 'rest':
      return mode === 'closed' ? 'peek' : mode;
    case 'leave':
      return mode === 'peek' ? 'closed' : mode;
    case 'toggle':
      return isPeek(mode) ? 'closed' : mode === 'closed' ? 'pinned' : mode;
    case 'update':
      return mode;
  }
  return mode;
}

function usePeek(canPeek: boolean) {
  const [mode, setMode] = useState<PeekMode>('closed');
  const updated = nextPeekMode(mode, 'update', canPeek);
  if (updated !== mode) {
    setMode(updated);
  }
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const current = timer;
    return () => clearTimeout(current.current);
  }, []);
  const close = useCallback(() => {
    clearTimeout(timer.current);
    setMode('closed');
  }, []);
  return {
    mode,
    startPeek: () => {
      clearTimeout(timer.current);
      const next = nextPeekMode(mode, 'rest', canPeek);
      if (next !== mode) {
        timer.current = setTimeout(() => setMode(next), peekDelay);
      }
    },
    endPeek: () => {
      clearTimeout(timer.current);
      const next = nextPeekMode(mode, 'leave', canPeek);
      if (next !== mode) {
        timer.current = setTimeout(() => setMode(next), unpeekDelay);
      }
    },
    togglePeek: () => {
      clearTimeout(timer.current);
      setMode(nextPeekMode(mode, 'toggle', canPeek));
    },
    open: () => {
      clearTimeout(timer.current);
      setMode('open');
    },
    close,
  };
}

export function MessagePeek({
  commit,
  onOpen,
}: {
  commit: CardCommit;
  onOpen: () => void;
}) {
  const popup = useRef<HTMLDivElement>(null);
  const maxHeight = usePopupHeight(popup);
  return (
    <div className="locations-popup peek" ref={popup} style={{ maxHeight }}>
      <div className="locations-search peek-search" onClick={onOpen}>
        <span className="address-text">
          <span className="address-hash">{shortHash(commit.hash)}</span>
          {commit.subject}
        </span>
      </div>
      <CommitDetails commit={commit} />
    </div>
  );
}

function AddressBar({
  root,
  address,
  repository,
  selected,
  hashLookup,
  onLookupHash,
  onJump,
}: {
  root: string | undefined;
  address: Address;
  hashLookup: { query: string; result: HashLookup } | undefined;
  onLookupHash: (query: string) => void;
  repository: RepositoryState | undefined;
  selected: string | undefined;
  onJump: (commit: string) => void;
}) {
  const { mode, startPeek, endPeek, togglePeek, open, close } = usePeek(
    address.commit !== undefined,
  );
  const [searches, setSearches] = useState(0);
  useShortcuts({
    'ctrl+l': () => {
      open();
      setSearches((count) => count + 1);
    },
    i: togglePeek,
  });
  const [queries, setQueries] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  const query = (root && queries.get(root)) ?? '';
  const setQuery = (next: string) =>
    root && setQueries((all) => new Map(all).set(root, next));
  const container = useRef<HTMLDivElement>(null);
  useDismiss(container, close, { enabled: isPeek(mode) });

  return (
    <div
      className="address"
      ref={container}
      onPointerEnter={startPeek}
      onPointerLeave={endPeek}
    >
      <button
        className="address-bar"
        title={address.commit ? undefined : 'Search branches, remotes and tags'}
        onClick={open}
      >
        <span className={`address-text ${address.subject ? '' : 'empty'}`}>
          {address.hash && (
            <span className="address-hash">{shortHash(address.hash)}</span>
          )}
          {address.subject ?? 'Search branches, remotes and tags'}
        </span>
      </button>
      {isPeek(mode) && address.commit && (
        <MessagePeek commit={address.commit} onOpen={open} />
      )}
      {mode === 'open' && (
        <LocationsPopup
          key={searches}
          repository={repository}
          selected={selected}
          anchor={container}
          lookup={hashLookup}
          onLookup={onLookupHash}
          onJump={onJump}
          onClose={close}
          query={query}
          onQuery={setQuery}
        />
      )}
    </div>
  );
}

function ShortcutsHelp() {
  const { mode, startPeek, endPeek, open, close } = usePeek(true);
  const container = useRef<HTMLDivElement>(null);
  const button = (
    <button
      className="nav-button"
      aria-label="Keyboard shortcuts"
      aria-expanded={mode !== 'closed'}
      onClick={mode === 'open' ? close : open}
    >
      <HelpIcon />
    </button>
  );
  return (
    <div
      className="shortcuts"
      ref={container}
      onPointerEnter={startPeek}
      onPointerLeave={endPeek}
    >
      {button}
      {mode !== 'closed' && (
        <ShortcutsPanel container={container} onClose={close}>
          {button}
        </ShortcutsPanel>
      )}
    </div>
  );
}

export function ShortcutsPanel({
  container,
  onClose,
  children,
}: {
  container: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useDismiss(container, onClose);
  return (
    <div className="shortcuts-panel">
      <div className="shortcuts-header">
        <div className="shortcuts-title">Keyboard shortcuts</div>
        {children}
      </div>
      <dl className="shortcuts-list">
        {shortcuts.map((shortcut) => (
          <Fragment key={shortcut.id}>
            <dt>
              {'ctrl' in shortcut && (
                <>
                  <kbd>Ctrl</kbd>+
                </>
              )}
              <kbd>{shortcut.key.toUpperCase()}</kbd>
            </dt>
            <dd>{shortcut.description}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}
