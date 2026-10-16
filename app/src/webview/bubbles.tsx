import { createContext, useContext } from 'react';
import { shortHash } from '../shared/hashes';
import type { BookmarkRef, Tracking } from '../shared/protocol';
import { strings } from '../shared/strings';
import {
  commitBookmarkTarget,
  refMenuTarget,
  useContextMenu,
} from './contextMenu';
import { PullIcon, PushIcon } from './icons';

export const CheckedOutBranch = createContext<string | undefined>(undefined);
export const DetachedHead = createContext<string | undefined>(undefined);
export const BookmarkedCommits = createContext<ReadonlySet<string>>(new Set());

export interface BranchActionsOf {
  readonly pulling: boolean;
  readonly pushing: boolean;
  readonly onPull: () => void;
  readonly onPush: () => void;
  readonly tracking?: Tracking;
}

export const BranchActions = createContext<BranchActionsOf | undefined>(
  undefined,
);

export interface TagActionsOf {
  readonly remote: string | undefined;
  readonly onRemote: ReadonlySet<string>;
  readonly pushing: readonly string[];
  readonly onPush: (tag: string) => void;
}

export const TagActions = createContext<TagActionsOf | undefined>(undefined);

export const HideDimmedButtons = createContext(false);

export interface OtherBranchActionsOf {
  readonly pulling: readonly string[];
  readonly pushing: readonly string[];
  readonly onPull: (branch: string) => void;
  readonly onPush: (branch: string) => void;
  readonly elsewhere: ReadonlySet<string>;
}

export const OtherBranchActions = createContext<
  OtherBranchActionsOf | undefined
>(undefined);

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
  tracking,
}: {
  info: BookmarkRef;
  missing?: boolean;
  actions?: boolean;
  tracking?: Tracking;
}) {
  const menu = useContextMenu(refMenuTarget(info));
  const checkedOut = useCheckedOut(info);
  const branchActions = useContext(BranchActions);
  const otherActions = useContext(OtherBranchActions);
  const tagActions = useContext(TagActions);
  const hideDimmed = useContext(HideDimmedButtons);
  const branchItems = (
    !actions
      ? []
      : checkedOut && branchActions !== undefined
        ? branchActionItems(branchActions)
        : !checkedOut && info.kind === 'branch' && otherActions !== undefined
          ? otherBranchItems(info.name, tracking, otherActions)
          : []
  ).filter((item) => !hideDimmed || !item.idle);
  const tagIdle =
    tagActions?.remote === undefined || tagActions.onRemote.has(info.name);
  const tagShown =
    actions &&
    info.kind === 'tag' &&
    tagActions !== undefined &&
    !(hideDimmed && tagIdle);
  const branchShown = branchItems.length > 0;
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
      {branchShown && (
        <span className="bubble-actions">{branchItems.map(actionButton)}</span>
      )}
      {tagShown && (
        <TagPushAction
          tag={info.name}
          remote={tagActions.remote}
          running={tagActions.pushing.includes(info.name)}
          idle={tagIdle}
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
  readonly count?: number;
  readonly idle?: boolean;
}

function actionButton({
  key,
  title,
  running,
  act,
  icon,
  count = 0,
  idle = false,
}: Action) {
  return (
    <button
      key={key}
      className={`bubble-action ${key} ${running ? 'running' : ''} ${idle ? 'idle' : ''}`}
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
      {count > 0 && <span className="bubble-count">{count}</span>}
    </button>
  );
}

function branchActionItems({
  pulling,
  pushing,
  onPull,
  onPush,
  tracking,
}: BranchActionsOf): Action[] {
  const counted = tracking !== undefined && !('gone' in tracking);
  const behind = counted ? tracking.behind : 0;
  const ahead = counted ? tracking.ahead : 0;
  const diverged = ahead > 0 && behind > 0;
  return [
    {
      key: 'pull',
      title: strings.navigation.pull,
      running: pulling,
      act: onPull,
      icon: <PullIcon />,
      count: behind,
      idle: behind === 0 || diverged,
    },
    {
      key: 'push',
      title: strings.navigation.push,
      running: pushing,
      act: onPush,
      icon: <PushIcon />,
      count: ahead,
      idle: (tracking !== undefined && ahead === 0) || diverged,
    },
  ];
}

function otherBranchItems(
  name: string,
  tracking: Tracking | undefined,
  actions: OtherBranchActionsOf,
): Action[] {
  const [pull, push] = branchActionItems({
    pulling: actions.pulling.includes(name),
    pushing: actions.pushing.includes(name),
    onPull: () => actions.onPull(name),
    onPush: () => actions.onPush(name),
    tracking,
  });
  return [{ ...pull, idle: pull.idle || actions.elsewhere.has(name) }, push];
}

export function OtherBranchButtons({
  name,
  tracking,
  actions,
}: {
  name: string;
  tracking: Tracking | undefined;
  actions: OtherBranchActionsOf;
}) {
  return (
    <span className="bubble-actions">
      {otherBranchItems(name, tracking, actions).map(actionButton)}
    </span>
  );
}

export function BubbleActions(actions: BranchActionsOf) {
  return (
    <span className="bubble-actions">
      {branchActionItems(actions).map(actionButton)}
    </span>
  );
}

export function TagPushAction({
  tag,
  remote,
  running,
  idle = false,
  onPush,
}: {
  tag: string;
  remote: string | undefined;
  running: boolean;
  idle?: boolean;
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
        idle,
      })}
    </span>
  );
}

export function StashBubble() {
  return <span className="badge stash">{strings.commits.stash}</span>;
}
