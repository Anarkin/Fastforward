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

export interface TagActionsOf {
  readonly remote: string;
  readonly onRemote: ReadonlySet<string>;
  readonly pushing: string | undefined;
  readonly onPush: (tag: string) => void;
}

export const TagActions = createContext<TagActionsOf | undefined>(undefined);

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
  const tagActions = useContext(TagActions);
  const branchShown = actions && checkedOut && branchActions !== undefined;
  const tagShown =
    actions &&
    info.kind === 'tag' &&
    tagActions !== undefined &&
    !tagActions.onRemote.has(info.name);
  return (
    <span
      className={`badge ${info.kind} ${checkedOut ? 'checked-out' : ''} ${missing ? 'missing' : ''} ${branchShown || tagShown ? 'with-actions' : ''}`}
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
      {branchShown && <BubbleActions {...branchActions} />}
      {tagShown && (
        <TagPushAction
          tag={info.name}
          remote={tagActions.remote}
          running={tagActions.pushing === info.name}
          onPush={tagActions.onPush}
        />
      )}
    </span>
  );
}

interface Action {
  readonly key: string;
  readonly title: string;
  readonly running: boolean;
  readonly act: () => void;
  readonly icon: React.ReactNode;
}

function actionButton({ key, title, running, act, icon }: Action) {
  return (
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
      ].map(actionButton)}
    </span>
  );
}

export function TagPushAction({
  tag,
  remote,
  running,
  onPush,
}: {
  tag: string;
  remote: string;
  running: boolean;
  onPush: (tag: string) => void;
}) {
  return (
    <span className="bubble-actions">
      {actionButton({
        key: 'push',
        title: strings.commits.pushTag(tag, remote),
        running,
        act: () => onPush(tag),
        icon: <PushIcon />,
      })}
    </span>
  );
}

export function StashBubble() {
  return <span className="badge stash">{strings.commits.stash}</span>;
}
