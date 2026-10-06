import { createContext, useContext } from 'react';
import { shortHash } from '../shared/hashes';
import type { BookmarkRef } from '../shared/protocol';
import { strings } from '../shared/strings';
import {
  commitBookmarkTarget,
  refMenuTarget,
  useContextMenu,
} from './contextMenu';

export const CheckedOutBranch = createContext<string | undefined>(undefined);
export const DetachedHead = createContext<string | undefined>(undefined);

export function useCheckedOut(ref: BookmarkRef): boolean {
  const checkedOutBranch = useContext(CheckedOutBranch);
  return ref.kind === 'branch' && ref.name === checkedOutBranch;
}

export function HeadBubble({ hash }: { hash: string }) {
  const menu = useContextMenu(commitBookmarkTarget(hash));
  return (
    <span
      className="badge head checked-out"
      title={strings.commits.detachedAt(hash)}
      {...menu}
    >
      {strings.commits.head(shortHash(hash))}
    </span>
  );
}

export function CommitBubble({ hash }: { hash: string }) {
  const menu = useContextMenu(commitBookmarkTarget(hash));
  return (
    <span className="badge hash" title={strings.commits.commit(hash)} {...menu}>
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
          ? strings.common.gone(info.name)
          : checkedOut
            ? strings.commits.checkedOut(info.name)
            : info.name
      }
      {...menu}
    >
      {info.name}
    </span>
  );
}

export function StashBubble() {
  return <span className="badge stash">{strings.commits.stash}</span>;
}
