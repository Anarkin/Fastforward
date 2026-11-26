import { strings } from '../../lib/shared/strings';
import type {
  FileChange,
  RefInfo,
  WorktreeInfo,
} from '../../tools/git/shared/protocol';
import { CommitRow } from '../../tools/git/page/commitRow';
import { gitStore, type ShownGit } from './componentFixtures';
import { GitStore } from '../../tools/git/page/store';
import {
  MessageBody,
  MessageCorner,
  MessagePanel,
} from '../../tools/git/page/messagePanel';
import { NavButtons } from '../../tools/git/page/navBar';
import { Twisty } from '../../components/diff/page/twisty';
import { treeIndent, twistyWidth } from '../../tools/git/page/treeLayout';
import { changeClass, changeKind, changeMark } from '../../lib/page/fileStatus';
import { WorktreeBar } from '../../tools/git/page/worktreeBar';
import { commitInfo } from './gitValues';
import { repository } from './styleMarkup';
import { ColumnShown } from './styleFixtures';
import { noop } from './fixtures';

export function NavButtonsShown({
  fetching = false,
  ...shown
}: ShownGit & { readonly fetching?: boolean }) {
  return (
    <GitStore value={gitStore({ ...shown, tab: { fetching } })}>
      <NavButtons />
    </GitStore>
  );
}

export function CommitColumn({
  autoFetchMinutes,
}: {
  readonly autoFetchMinutes?: number;
}) {
  return (
    <ColumnShown
      start={<NavButtonsShown autoFetchMinutes={autoFetchMinutes} />}
    />
  );
}

export function WorktreeBarShown({
  worktrees,
  active,
}: {
  readonly worktrees?: readonly WorktreeInfo[];
  readonly active?: string;
}) {
  return (
    <GitStore
      value={gitStore({
        ...(worktrees && { worktrees }),
        tab: { ...(active !== undefined && { root: active }) },
      })}
    >
      <WorktreeBar />
    </GitStore>
  );
}

interface RowShown extends Partial<Parameters<typeof CommitRow>[0]> {
  readonly refs?: readonly RefInfo[];
  readonly stash?: boolean;
  readonly detached?: boolean;
  readonly head?: string;
  readonly headCommit?: string;
}

export function CommitRowShown({
  refs = [],
  stash = false,
  detached = false,
  bookmarked = false,
  head,
  headCommit,
  ...props
}: RowShown & { readonly bookmarked?: boolean }) {
  const commit = props.commit ?? commitInfo('a');
  return (
    <GitStore
      value={gitStore({
        head: detached
          ? undefined
          : (head ?? (headCommit === undefined ? undefined : 'main')),
        headCommit: detached ? commit.hash : headCommit,
        refs,
        stashes: stash
          ? [{ name: 'stash@{0}', commit: commit.hash, message: '' }]
          : [],
        bookmarks: bookmarked ? [{ kind: 'commit', name: commit.hash }] : [],
      })}
    >
      <CommitRow
        commit={commit}
        selected={undefined}
        indent={0}
        onSelect={noop}
        {...props}
      />
    </GitStore>
  );
}

export function MessagePanelShown({
  pinned = false,
  ...props
}: RowShown & { readonly pinned?: boolean }) {
  return (
    <MessagePanel
      anchor={{
        left: 0,
        top: 0,
        width: 100,
        room: { top: 0, bottom: 500 },
      }}
      indent={8}
      onUnpin={pinned ? noop : undefined}
    >
      <CommitRowShown
        {...{
          indent: 8,
          corner: <MessageCorner onUnpin={pinned ? noop : undefined} />,
          children: <MessageBody text="Body" />,
          ...props,
        }}
      />
    </MessagePanel>
  );
}

export function WorkingTreeRowShown({ count }: { readonly count: number }) {
  return (
    <div
      className={
        count === 0 ? 'commit working-tree empty' : 'commit working-tree'
      }
    >
      <div className="commit-line">
        <span className="subject">
          {strings.commits.uncommittedChanges(count)}
        </span>
      </div>
    </div>
  );
}

export function FileRowShown({
  change,
  chosen = false,
}: {
  readonly change?: FileChange;
  readonly chosen?: boolean;
}) {
  return (
    <div
      className={`row tree-row file ${chosen ? 'selected' : ''}`}
      style={{ paddingLeft: treeIndent(0) }}
    >
      <span
        className={
          change === undefined
            ? 'change-mark'
            : `change-mark ${changeKind(change)}`
        }
        aria-hidden="true"
      >
        {changeMark(change)}
      </span>
      <span
        className="tree-indent"
        style={{ width: treeIndent(1) - treeIndent(0) + twistyWidth }}
      />
      <span className={`${changeClass(change)} path-cut`}>
        <span className="path-piece">
          <span className="path-part">a.ts</span>
        </span>
      </span>
    </div>
  );
}

export function FolderRowShown() {
  return (
    <div
      className="row tree-row folder "
      style={{ paddingLeft: treeIndent(0) }}
    >
      <span className="change-mark" aria-hidden="true">
        {changeMark(undefined)}
      </span>
      <span className="tree-indent" style={{ width: 0 }} />
      <Twisty open />
      <span className="path path-cut">
        <span className="path-piece">
          <span className="path-part">src</span>
        </span>
      </span>
    </div>
  );
}

export function BubbleSources({
  checkedOut,
}: {
  readonly checkedOut?: string;
}) {
  const store = () =>
    gitStore(checkedOut === undefined ? {} : { head: checkedOut });
  return (
    <>
      <GitStore value={store()}>
        <CommitRowShown
          refs={repository.refs}
          stash
          selected="a"
          head={checkedOut}
        />
      </GitStore>
      <GitStore value={store()}>
        <CommitRowShown refs={repository.refs} detached />
      </GitStore>
      <GitStore value={store()}>
        <CommitRowShown bookmarked />
      </GitStore>
    </>
  );
}
