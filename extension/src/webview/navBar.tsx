import { useCallback, useEffect, useRef, useState } from 'react';
import type { HashLookup, NavigationEntry } from '../protocol';
import { CommitDetails, type CardCommit } from './commitCard';
import { useDismiss } from './contextMenu';
import { LocationsPopup, usePopupHeight, type Repository } from './locations';

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
        <span className="sync-arrow">⟳</span>
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
        {direction === 'back' ? '←' : '→'}
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
  // The whole message, for the popup
  // For the card in the peek and popup
  readonly commit: CardCommit | undefined;
}

// How long the pointer rests on the address bar before it peeks, so passing
// over it on the way elsewhere doesn't, and how long the peek stays after
const peekDelay = 300;
const unpeekDelay = 200;

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
  // click opens the search, which stays until closed
  const [mode, setMode] = useState<'closed' | 'peek' | 'open'>('closed');
  const peekTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const startPeek = () => {
    clearTimeout(peekTimer.current);
    if (mode === 'closed' && address.commit) {
      peekTimer.current = setTimeout(() => setMode('peek'), peekDelay);
    }
  };
  // A moment's grace, so a wobbly move from the bar into the peek keeps it
  const endPeek = () => {
    clearTimeout(peekTimer.current);
    if (mode === 'peek') {
      peekTimer.current = setTimeout(() => setMode('closed'), unpeekDelay);
    }
  };
  useEffect(() => {
    const timer = peekTimer;
    return () => clearTimeout(timer.current);
  }, [peekTimer]);
  const open = () => {
    clearTimeout(peekTimer.current);
    setMode('open');
  };
  // The search text of each repository, kept while the popup is closed
  const [queries, setQueries] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  const query = (root && queries.get(root)) ?? '';
  const setQuery = (next: string) =>
    root && setQueries((all) => new Map(all).set(root, next));
  const container = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setMode('closed'), []);

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
