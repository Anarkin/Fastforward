import { createContext, useContext } from 'react';
import { shortHash } from '../shared/hashes';
import type { BookmarkRef } from '../shared/protocol';
import { useContextMenu } from './contextMenu';

export const CheckedOutBranch = createContext<string | undefined>(undefined);
export const DetachedHead = createContext<string | undefined>(undefined);

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

export function CommitBubble({
  hash,
  onClick,
}: {
  hash: string;
  onClick?: () => void;
}) {
  const menu = useContextMenu({
    kind: 'ref',
    ref: { kind: 'commit', name: hash },
  });
  return (
    <span
      className={`badge hash ${onClick ? 'clickable' : ''}`}
      title={`Commit ${hash}`}
      onClick={onClick}
      {...menu}
    >
      {shortHash(hash)}
    </span>
  );
}

export function RefBubble({
  info,
  missing = false,
  onClick,
}: {
  info: BookmarkRef;
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
