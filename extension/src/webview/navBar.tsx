import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { HashLookup, NavigationEntry } from '../protocol';
import { CommitDetails, type CardCommit } from './commitCard';
import { useDismiss } from './contextMenu';
import { BackIcon, ForwardIcon, HelpIcon, RefreshIcon } from './icons';
import { LocationsPopup, usePopupHeight, type Repository } from './locations';
import { shortcuts, useShortcuts } from './shortcuts';

// Holding a back or forward button this long opens its history, like a
// browser's
const holdDelay = 400;

export type Direction = 'back' | 'forward';

// The toolbar above the bubbles: back, forward and fetch, then the address
// bar, which says where the tab is and searches every branch, remote and tag
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
  // The active tab, whose search text the address bar keeps
  root: string | undefined;
  hashLookup: { query: string; result: HashLookup } | undefined;
  onLookupHash: (query: string) => void;
  // Nearest first
  back: readonly NavigationEntry[];
  forward: readonly NavigationEntry[];
  onNavigate: (direction: Direction, steps: number) => void;
  fetching: boolean;
  onFetch: () => void;
  address: Address;
  repository: Repository | undefined;
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

// Click to go a step, hold or right-click to pick one from the history
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
  // The hold opened the history, so letting go doesn't also go a step
  const held = useRef(false);
  const close = useCallback(() => setOpen(false), []);
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
          if (!held.current) {
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

function HistoryMenu({
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
          // The same commit can be in the history twice
          key={index}
          className="menu-item history-item"
          role="menuitem"
          title={entry.hash}
          onClick={() => onPick(index + 1)}
        >
          <span className="history-hash">{entry.hash.slice(0, 7)}</span>
          {entry.subject ?? ''}
        </button>
      ))}
    </div>
  );
}

// What the address bar shows about the selected commit
export interface Address {
  readonly hash: string | undefined;
  // One line, for the bar
  readonly subject: string | undefined;
  // For the card in the peek and popup
  readonly commit: CardCommit | undefined;
}

// How long the pointer rests on the address bar before it peeks, so passing
// over it on the way elsewhere doesn't, and how long the peek stays after
const peekDelay = 300;
const unpeekDelay = 200;

export type PeekMode = 'closed' | 'peek' | 'open';

// What the pointer resting on something, or leaving it, and the keyboard's
// toggle lead to; the pointer's get there after a delay
export function nextPeekMode(
  mode: PeekMode,
  action: 'rest' | 'leave' | 'toggle',
  canPeek: boolean,
): PeekMode {
  if (mode === 'peek' && action !== 'rest') {
    return 'closed';
  }
  if (mode === 'closed' && canPeek && action !== 'leave') {
    return 'peek';
  }
  return mode;
}

// Resting the pointer on something peeks at what it opens, which stays while
// the pointer is on it or on the peek; a click opens it to stay until closed
function usePeek(canPeek: boolean) {
  const [mode, setMode] = useState<PeekMode>('closed');
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
    // A moment's grace, so a wobbly move from the button into the peek
    // keeps it
    endPeek: () => {
      clearTimeout(timer.current);
      const next = nextPeekMode(mode, 'leave', canPeek);
      if (next !== mode) {
        timer.current = setTimeout(() => setMode(next), unpeekDelay);
      }
    },
    // From the keyboard, staying until toggled again or dismissed
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

// The top of the search popup in its place, the bar's text staying in its
// box, and the commit's details under it; it doesn't take the keyboard, and
// a click in the box opens the search, which doesn't show them, while the
// details can be selected and copied
export function MessagePeek({
  commit,
  onOpen,
}: {
  commit: CardCommit;
  onOpen: () => void;
}) {
  const [subject] = commit.message.split('\n');
  // As far down as the search goes, but only as tall as the details need
  const popup = useRef<HTMLDivElement>(null);
  const maxHeight = usePopupHeight(popup);
  return (
    <div className="locations-popup peek" ref={popup} style={{ maxHeight }}>
      <div className="locations-search peek-search" onClick={onOpen}>
        <span className="address-text">
          <span className="address-hash">{commit.hash.slice(0, 7)}</span>
          {subject}
        </span>
      </div>
      <CommitDetails commit={commit} />
    </div>
  );
}

// Shows the selected commit like a browser shows its page's address; a click
// opens the search over it, as Chrome's address bar opens its suggestions
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
  repository: Repository | undefined;
  selected: string | undefined;
  onJump: (commit: string) => void;
}) {
  // Resting the pointer on the bar peeks at the whole commit message; a
  // click opens the search
  const { mode, startPeek, endPeek, togglePeek, open, close } = usePeek(
    address.commit !== undefined,
  );
  // Ctrl+L like Chrome's
  useShortcuts({ 'ctrl+l': open, i: togglePeek });
  // The search text of each repository, kept while the popup is closed
  const [queries, setQueries] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  const query = (root && queries.get(root)) ?? '';
  const setQuery = (next: string) =>
    root && setQueries((all) => new Map(all).set(root, next));
  const container = useRef<HTMLDivElement>(null);
  // A peek from the keyboard goes with Escape or a click elsewhere
  useDismiss(container, close, { enabled: mode === 'peek' });

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
        {/* One line of text, so the hash and the subject share a baseline
            although their fonts differ */}
        <span className={`address-text ${address.subject ? '' : 'empty'}`}>
          {address.hash && (
            <span className="address-hash">{address.hash.slice(0, 7)}</span>
          )}
          {address.subject ?? 'Search branches, remotes and tags'}
        </span>
      </button>
      {mode === 'peek' && address.commit && (
        <MessagePeek commit={address.commit} onOpen={open} />
      )}
      {mode === 'open' && (
        <LocationsPopup
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

// A ? at the right of the address bar: resting the pointer on it peeks at
// the keyboard shortcuts, and a click keeps them open until closed; they
// open from the ?, which stays in its place in their top right corner, as
// the address bar's popup opens from the bar
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
  // The ?, in its place
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
