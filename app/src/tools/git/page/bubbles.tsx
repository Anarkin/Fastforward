import { labelTip, tip } from '../../../lib/page/tips';
import { shortHash } from '../../../lib/shared/hashes';
import type { BookmarkRef, Tracking } from '../shared/protocol';
import { strings } from '../../../lib/shared/strings';
import { commitBookmarkTarget, refMenuTarget, useContextMenu } from './menus';
import { useGit, useGitActions } from './store';
import { PullIcon, PushIcon } from '../../../lib/page/icons';
import { memo } from 'react';
import {
  isCheckedOut,
  lookKey,
  refActions,
  type ActionKey,
  type ActionLook,
  type BubbleLook,
} from './bubbleLooks';

export function HeadBubble({ hash }: { hash: string }) {
  const menu = useContextMenu(commitBookmarkTarget(hash));
  return (
    <span
      className="badge head checked-out"
      {...tip(strings.commits.detachedAt(hash))}
      {...menu}
    >
      {strings.commits.head(shortHash(hash))}
    </span>
  );
}

export function CommitBubble({ hash }: { hash: string }) {
  const menu = useContextMenu(commitBookmarkTarget(hash));
  return (
    <span
      className="badge hash"
      {...tip(strings.commits.commit(hash))}
      {...menu}
    >
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
  const head = useGit((state) => state.tab.repository?.head);
  const checkedOut = isCheckedOut(info, head);
  const hideDimmed = useGit((state) => state.hideDimmed);
  const pulling = useGit((state) =>
    checkedOut ? state.tab.pulling : state.tab.pullingBranch.includes(name),
  );
  const pushing = useGit((state) =>
    checkedOut ? state.tab.pushing : state.tab.pushingBranch.includes(name),
  );
  const elsewhere = useGit((state) => state.elsewhere);
  const tagRemote = useGit((state) => state.tab.repository?.tagRemote);
  const tagsOnRemote = useGit((state) => state.tagsOnRemote);
  const { pull, push, pullBranch, pushBranch } = useGitActions();
  const shown = actions
    ? refActions(info, tracking, {
        head,
        hideDimmed,
        elsewhere,
        tagRemote,
        tagsOnRemote,
      })
    : [];
  const branchItems = kind === 'tag' ? [] : shown.map(actionOf);
  const tagAction = kind === 'tag' ? shown[0] : undefined;
  const withActions = shown.length > 0;
  function actionOf(action: ActionLook): Action {
    const pulls = action.key === 'pull';
    return {
      ...action,
      title: pulls ? strings.navigation.pull : strings.navigation.push,
      running: pulls ? pulling : pushing,
      act: checkedOut
        ? pulls
          ? pull
          : push
        : () => (pulls ? pullBranch : pushBranch)(name),
      icon: actionIcon(action.key),
    };
  }
  return (
    <span
      className={`badge ${kind} ${checkedOut ? 'checked-out' : ''} ${missing ? 'missing' : ''} ${withActions ? 'with-actions' : ''}`}
      {...tip(
        missing
          ? strings.common.gone(name)
          : checkedOut
            ? strings.commits.checkedOut(name)
            : name,
        { cut: !missing && !checkedOut },
      )}
      {...menu}
    >
      {withActions ? <span className="bubble-name">{name}</span> : name}
      {branchItems.length > 0 && (
        <span className="bubble-actions">{branchItems.map(actionButton)}</span>
      )}
      {tagAction && <TagPushAction tag={name} idle={tagAction.idle} />}
    </span>
  );
}

function actionIcon(key: ActionKey): React.ReactNode {
  return key === 'pull' ? <PullIcon /> : <PushIcon />;
}

export const BubbleReplica = memo(
  function BubbleReplica({ look }: { look: BubbleLook }) {
    const withActions = look.actions.length > 0;
    return (
      <span
        className={`badge ${look.kind} ${withActions ? 'with-actions' : ''}`}
      >
        {withActions ? (
          <span className="bubble-name">{look.text}</span>
        ) : (
          look.text
        )}
        {withActions && (
          <span className="bubble-actions">
            {look.actions.map((action) => (
              <button
                key={action.key}
                className={`bubble-action ${action.key}`}
                tabIndex={-1}
              >
                {actionIcon(action.key)}
                {action.count > 0 && (
                  <span className="bubble-count">{action.count}</span>
                )}
              </button>
            ))}
          </span>
        )}
      </span>
    );
  },
  (before, after) => lookKey(before.look) === lookKey(after.look),
);

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
      {...labelTip(title)}
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
