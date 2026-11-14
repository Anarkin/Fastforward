import { shortHash } from '../shared/hashes';
import type { BookmarkRef, Tracking } from '../shared/protocol';
import { strings } from '../../../lib/shared/strings';
import { commitBookmarkTarget, refMenuTarget, useContextMenu } from './menus';
import { useGit, useGitActions } from './store';
import { PullIcon, PushIcon } from '../../../lib/page/icons';
import { type BranchActionsOf, useCheckedOut } from './checkedOut';

interface OtherBranchActionsOf {
  readonly pulling: boolean;
  readonly pushing: boolean;
  readonly elsewhere: boolean;
  readonly onPull: (branch: string) => void;
  readonly onPush: (branch: string) => void;
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
  const { kind, name } = info;
  const menu = useContextMenu(refMenuTarget(info));
  const checkedOut = useCheckedOut(info);
  const hideDimmed = useGit((state) => state.hideDimmed);
  const pulling = useGit((state) =>
    checkedOut ? state.tab.pulling : state.tab.pullingBranch.includes(name),
  );
  const pushing = useGit((state) =>
    checkedOut ? state.tab.pushing : state.tab.pushingBranch.includes(name),
  );
  const elsewhere = useGit((state) => state.elsewhere.has(name));
  const tagRemote = useGit((state) => state.tab.repository?.tagRemote);
  const onRemote = useGit((state) => state.tagsOnRemote.has(name));
  const { pull, push, pullBranch, pushBranch } = useGitActions();
  const branchItems = (
    !actions
      ? []
      : checkedOut
        ? branchActionItems({
            pulling,
            pushing,
            onPull: pull,
            onPush: push,
            tracking,
          })
        : kind === 'branch'
          ? otherBranchItems(name, tracking, {
              pulling,
              pushing,
              elsewhere,
              onPull: pullBranch,
              onPush: pushBranch,
            })
          : []
  ).filter((item) => !hideDimmed || !item.idle);
  const tagIdle = tagRemote === undefined || onRemote;
  const tagShown = actions && kind === 'tag' && !(hideDimmed && tagIdle);
  const branchShown = branchItems.length > 0;
  const withActions = branchShown || tagShown;
  return (
    <span
      className={`badge ${kind} ${checkedOut ? 'checked-out' : ''} ${missing ? 'missing' : ''} ${withActions ? 'with-actions' : ''}`}
      title={
        missing
          ? strings.common.gone(name)
          : checkedOut
            ? strings.commits.checkedOut(name)
            : name
      }
      {...menu}
    >
      {withActions ? <span className="bubble-name">{name}</span> : name}
      {branchShown && (
        <span className="bubble-actions">{branchItems.map(actionButton)}</span>
      )}
      {tagShown && <TagPushAction tag={name} idle={tagIdle} />}
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
    pulling: actions.pulling,
    pushing: actions.pushing,
    onPull: () => actions.onPull(name),
    onPush: () => actions.onPush(name),
    tracking,
  });
  return [{ ...pull, idle: pull.idle || actions.elsewhere }, push];
}

export function TagPushAction({
  tag,
  idle = false,
}: {
  tag: string;
  idle?: boolean;
}) {
  const remote = useGit((state) => state.tab.repository?.tagRemote);
  const running = useGit((state) => state.tab.pushingTag.includes(tag));
  const { pushTag: onPush } = useGitActions();
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
