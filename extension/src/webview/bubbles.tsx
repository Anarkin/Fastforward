import { createContext, Fragment, useContext } from 'react';
import { shortHash } from '../shared/hashes';
import {
  type Bookmark,
  type BookmarkRef,
  type RepositoryState,
} from '../shared/protocol';
import { sameRef } from '../shared/refNames';
import { useContextMenu } from './contextMenu';
import { SkeletonBubbles, useSkeleton } from './skeleton';
import { type BubbleRow, bubbleRow } from './bookmarks';

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
      HEAD {shortHash(commit)}
    </span>
  );
}

// A commit pinned to the bookmarks row, with the same menu as the other bubbles
function CommitBubble({
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
      {shortHash(hash)}
    </span>
  );
}

// A branch, remote or tag bubble, with its menu on right-click
export function RefBubble({
  info,
  missing = false,
  onClick,
}: {
  info: BookmarkRef;
  // A bookmark whose ref doesn't exist anymore
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

// The row under the address bar: the repository's bookmarks, sorted, and
// what is checked out; clicking one jumps to it
export function BubbleBar({
  root,
  repository,
  bookmarks,
  onJump,
}: {
  // The active tab, whose refs may still be loading
  root: string | undefined;
  repository: RepositoryState | undefined;
  bookmarks: readonly Bookmark[];
  onJump: (commit: string) => void;
}) {
  const refs = repository?.refs ?? [];
  const detached = useContext(DetachedHead);
  const row = bubbleRow(
    bookmarks,
    refs,
    repository?.head,
    repository?.headUpstream,
    detached,
  );
  const bubble = (bookmark: Bookmark) => {
    if (bookmark.kind === 'commit') {
      return (
        <CommitBubble
          key={`commit:${bookmark.name}`}
          hash={bookmark.name}
          onClick={() => onJump(bookmark.name)}
        />
      );
    }
    const ref = refs.find((r) => sameRef(r, bookmark));
    return (
      <RefBubble
        key={`${bookmark.kind}:${bookmark.name}`}
        info={bookmark}
        missing={!ref}
        onClick={ref && (() => onJump(ref.commit))}
      />
    );
  };
  const skeleton = useSkeleton(root !== undefined && repository === undefined);
  const checkedOut = (
    <CheckedOut detached={detached} row={row} bubble={bubble} onJump={onJump} />
  );
  return (
    <div className="bubble-bar">
      {skeleton && <SkeletonBubbles count={3} />}
      {row.bookmarks.map((bookmark) =>
        (bookmark.kind === 'commit' && bookmark.name === detached) ||
        (row.branch && sameRef(bookmark, row.branch)) ? (
          <Fragment key="checked-out">{checkedOut}</Fragment>
        ) : (
          bubble(bookmark)
        ),
      )}
      {!row.checkedOutIsBookmark && (detached || row.branch) && (
        <>
          {row.bookmarks.length > 0 && <span className="bubble-separator" />}
          <span className="bubble-label">Checked out</span>
          {checkedOut}
        </>
      )}
    </div>
  );
}

// What is checked out: a detached HEAD, or the checked-out branch and the
// branch it tracks
function CheckedOut({
  detached,
  row,
  bubble,
  onJump,
}: {
  detached: string | undefined;
  row: BubbleRow;
  bubble: (bookmark: Bookmark) => React.ReactNode;
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
          {row.upstream && bubble(row.upstream)}
        </div>
      )}
    </>
  );
}
