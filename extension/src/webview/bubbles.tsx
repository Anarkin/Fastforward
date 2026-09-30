import { createContext, useContext } from 'react';
import { shortHash } from '../shared/hashes';
import type { BookmarkRef } from '../shared/protocol';
import { refMenuTarget, useContextMenu } from './contextMenu';

export const CheckedOutBranch = createContext<string | undefined>(undefined);
export const DetachedHead = createContext<string | undefined>(undefined);

export function useCheckedOut(ref: BookmarkRef): boolean {
  const checkedOutBranch = useContext(CheckedOutBranch);
  return ref.kind === 'branch' && ref.name === checkedOutBranch;
}

export function HeadBubble({ hash }: { hash: string }) {
  const menu = useContextMenu({
    kind: 'ref',
    ref: { kind: 'commit', name: hash },
  });
  return (
    <span
      className="badge head checked-out"
      title={`HEAD is detached at ${hash}`}
      {...menu}
    >
      HEAD {shortHash(hash)}
    </span>
  );
}

export function CommitBubble({ hash }: { hash: string }) {
  const menu = useContextMenu({
    kind: 'ref',
    ref: { kind: 'commit', name: hash },
  });
  return (
    <span className="badge hash" title={`Commit ${hash}`} {...menu}>
      {shortHash(hash)}
    </span>
  );
}

export function RefBubble({
  info,
  missing = false,
}: {
  info: BookmarkRef;
  missing?: boolean;
}) {
  const menu = useContextMenu(refMenuTarget(info));
  const checkedOut = useCheckedOut(info);
  return (
    <span
      className={`badge ${info.kind} ${checkedOut ? 'checked-out' : ''} ${missing ? 'missing' : ''}`}
      title={
        missing
          ? `${info.name} doesn't exist anymore`
          : checkedOut
            ? `${info.name}, checked out`
            : info.name
      }
      {...menu}
    >
      {info.name}
    </span>
  );
}
