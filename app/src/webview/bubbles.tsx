import { createContext, useContext } from 'react';
import { shortHash } from '../shared/hashes';
import type { BookmarkRef } from '../shared/protocol';
import { strings } from '../shared/strings';
import {
  commitBookmarkTarget,
  refMenuTarget,
  useContextMenu,
} from './contextMenu';
import { PullIcon, PushIcon } from './icons';

export const CheckedOutBranch = createContext<string | undefined>(undefined);
export const DetachedHead = createContext<string | undefined>(undefined);

export interface BranchActionsOf {
  readonly pulling: boolean;
  readonly pushing: boolean;
  readonly onPull: () => void;
  readonly onPush: () => void;
}

export const BranchActions = createContext<BranchActionsOf | undefined>(
  undefined,
);

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
  actions = false,
}: {
  info: BookmarkRef;
  missing?: boolean;
  actions?: boolean;
}) {
  const menu = useContextMenu(refMenuTarget(info));
  const checkedOut = useCheckedOut(info);
  const branchActions = useContext(BranchActions);
  const withActions = actions && checkedOut && branchActions !== undefined;
  return (
    <span
      className={`badge ${info.kind} ${checkedOut ? 'checked-out' : ''} ${missing ? 'missing' : ''} ${withActions ? 'with-actions' : ''}`}
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
      {withActions && <BubbleActions {...branchActions} />}
    </span>
  );
}

export function BubbleActions({
  pulling,
  pushing,
  onPull,
  onPush,
}: BranchActionsOf) {
  return (
    <span className="bubble-actions">
      {[
        {
          key: 'pull',
          title: strings.navigation.pull,
          running: pulling,
          act: onPull,
          icon: <PullIcon />,
        },
        {
          key: 'push',
          title: strings.navigation.push,
          running: pushing,
          act: onPush,
          icon: <PushIcon />,
        },
      ].map(({ key, title, running, act, icon }) => (
        <button
          key={key}
          className={`bubble-action ${key} ${running ? 'running' : ''}`}
          title={title}
          tabIndex={-1}
          disabled={running}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            act();
          }}
        >
          {icon}
        </button>
      ))}
    </span>
  );
}

export function StashBubble() {
  return <span className="badge stash">{strings.commits.stash}</span>;
}
