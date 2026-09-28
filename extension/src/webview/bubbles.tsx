import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { type SyncAction, type Vip, type VipRef } from '../protocol';
import { sameRef } from '../refNames';
import { useContextMenu } from './contextMenu';
import { LocationsPopup, type Repository } from './locations';
import { type BubbleRow, bubbleRow } from './vips';

// The name of the branch HEAD is on, whose bubbles stand out everywhere
export const CheckedOutBranch = createContext<string | undefined>(undefined);
// The commit HEAD points at when no branch is checked out
export const DetachedHead = createContext<string | undefined>(undefined);

// A detached HEAD, as a bubble with the commit's short hash, in the colors of
// the checked-out branch
export function HeadBubble({
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

// A commit pinned to the VIP row, with the same menu as the other bubbles
export function CommitBubble({
  hash,
  onClick,
}: {
  hash: string;
  onClick: () => void;
}) {
  const menu = useContextMenu({
    kind: 'ref',
    ref: { kind: 'commit', name: hash },
  });
  return (
    <span
      className="badge commit clickable"
      title={`Commit ${hash}`}
      onClick={onClick}
      {...menu}
    >
      {hash.slice(0, 7)}
    </span>
  );
}

// A branch, remote or tag bubble, with its menu on right-click
export function RefBubble({
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
  const checkedOutBranch = useContext(CheckedOutBranch);
  const checkedOut = info.kind === 'branch' && info.name === checkedOutBranch;
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
export function BubbleBar({
  root,
  repository,
  selected,
  vips,
  syncing,
  onSync,
  onJump,
}: {
  // The active tab's repository, whose search text the popup shows
  root: string | undefined;
  repository: Repository | undefined;
  selected: string | undefined;
  vips: readonly Vip[];
  onJump: (commit: string) => void;
  // The pull or push that is running
  syncing: SyncAction | undefined;
  onSync: (action: SyncAction) => void;
}) {
  const [locationsOpen, setLocationsOpen] = useState(false);
  // The search text of each repository, kept while the popup is closed
  const [queries, setQueries] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  const locationsQuery = (root && queries.get(root)) ?? '';
  const setLocationsQuery = (query: string) =>
    root && setQueries((all) => new Map(all).set(root, query));
  const button = useRef<HTMLButtonElement>(null);
  const closeLocations = useCallback(() => setLocationsOpen(false), []);
  const refs = repository?.refs ?? [];
  const detached = useContext(DetachedHead);
  const row = bubbleRow(
    vips,
    refs,
    repository?.head,
    repository?.headUpstream,
    detached,
  );
  const bubble = (vip: Vip) => {
    if (vip.kind === 'commit') {
      return (
        <CommitBubble
          key={`commit:${vip.name}`}
          hash={vip.name}
          onClick={() => onJump(vip.name)}
        />
      );
    }
    const ref = refs.find((r) => sameRef(r, vip));
    return (
      <RefBubble
        key={`${vip.kind}:${vip.name}`}
        info={vip}
        missing={!ref}
        onClick={ref && (() => onJump(ref.commit))}
      />
    );
  };
  const checkedOut = (
    <CheckedOut
      detached={detached}
      row={row}
      bubble={bubble}
      behind={repository?.behind ?? 0}
      ahead={repository?.ahead ?? 0}
      syncing={syncing}
      onSync={onSync}
      onJump={onJump}
    />
  );
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
      {row.vips.map((vip) =>
        (vip.kind === 'commit' && vip.name === detached) ||
        (row.branch && sameRef(vip, row.branch)) ? (
          <Fragment key="checked-out">{checkedOut}</Fragment>
        ) : (
          bubble(vip)
        ),
      )}
      {!row.checkedOutIsVip && (detached || row.branch) && (
        <>
          {row.vips.length > 0 && <span className="bubble-separator" />}
          <span className="bubble-label">Checked out</span>
          {checkedOut}
        </>
      )}
    </div>
  );
}

// What is checked out: a detached HEAD, or the checked-out branch and the
// branch it tracks, with pull and push between them
export function CheckedOut({
  detached,
  row,
  bubble,
  behind,
  ahead,
  syncing,
  onSync,
  onJump,
}: {
  detached: string | undefined;
  row: BubbleRow;
  bubble: (vip: Vip) => React.ReactNode;
  behind: number;
  ahead: number;
  syncing: SyncAction | undefined;
  onSync: (action: SyncAction) => void;
  onJump: (commit: string) => void;
}) {
  return (
    <>
      {detached && (
        <HeadBubble commit={detached} onClick={() => onJump(detached)} />
      )}
      {row.branch && (
        <div className="checked-out-pair">
          {bubble(row.branch)}
          {row.upstream && (
            <>
              <SyncButton
                action="pull"
                count={behind}
                upstream={row.upstream.name}
                syncing={syncing}
                onSync={onSync}
              />
              <SyncButton
                action="push"
                count={ahead}
                upstream={row.upstream.name}
                syncing={syncing}
                onSync={onSync}
              />
              {bubble(row.upstream)}
            </>
          )}
        </div>
      )}
    </>
  );
}

// Pulls the commits the upstream has, or pushes the ones the branch has, with
// how many there are; only there when there are some, or while it runs, when
// it spins
export function SyncButton({
  action,
  count,
  upstream,
  syncing,
  onSync,
}: {
  action: SyncAction;
  count: number;
  upstream: string;
  syncing: SyncAction | undefined;
  onSync: (action: SyncAction) => void;
}) {
  if (count === 0 && syncing !== action) {
    return null;
  }
  const commits = `${count} ${count === 1 ? 'commit' : 'commits'}`;
  const title =
    action === 'pull'
      ? count
        ? `Pull ${commits} from ${upstream}`
        : `Nothing to pull from ${upstream}, as of the last fetch`
      : count
        ? `Push ${commits} to ${upstream}`
        : `Nothing to push to ${upstream}`;
  return (
    <button
      className={`sync-button ${syncing === action ? 'running' : ''}`}
      title={title}
      disabled={count === 0 || syncing !== undefined}
      onClick={() => onSync(action)}
    >
      <span className="sync-arrow">{action === 'pull' ? '←' : '→'}</span>
      {count > 0 && count}
    </button>
  );
}
