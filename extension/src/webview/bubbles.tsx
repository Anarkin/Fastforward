import { createContext, useContext } from 'react';
import { shortHash } from '../shared/hashes';
import type { BookmarkRef, RefInfo } from '../shared/protocol';
import { useContextMenu } from './contextMenu';

export const CheckedOutBranch = createContext<string | undefined>(undefined);
export const DetachedHead = createContext<string | undefined>(undefined);

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
    <span className="badge commit" title={`Commit ${hash}`} {...menu}>
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
  const menu = useContextMenu({
    kind: 'ref',
    ref: { kind: info.kind, name: info.name },
  });
  const checkedOutBranch = useContext(CheckedOutBranch);
  const checkedOut = info.kind === 'branch' && info.name === checkedOutBranch;
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

export function commitBubbles(
  hash: string,
  refs: readonly RefInfo[],
  detached: boolean,
): { key: string; element: React.ReactElement }[] {
  return [
    ...(detached ? [{ key: 'HEAD', element: <HeadBubble hash={hash} /> }] : []),
    ...refs.map((ref) => ({
      key: `${ref.kind}:${ref.name}`,
      element: <RefBubble info={ref} />,
    })),
  ];
}
