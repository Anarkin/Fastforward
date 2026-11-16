import { plainSearch } from '../../lib/shared/searchOptions';
import type {
  Bookmark,
  FileChange,
  GitToWebviewOf,
  RefInfo,
  WorktreeInfo,
} from '../../tools/git/shared/protocol';
import { emptyTabView } from '../../tools/git/page/tabView';
import { ChangesTreeItem } from '../../tools/git/page/changesTree';
import { WorkingTreeRow } from '../../tools/git/page/commitRow';
import { CommitRow } from '../../tools/git/page/commitRow';
import { gitStore, type ShownGit } from './componentFixtures';
import { LocationsPopup } from '../../tools/git/page/locations';
import { createGitStore, GitStore } from '../../tools/git/page/store';
import {
  MessageBody,
  MessageCorner,
  MessagePanel,
} from '../../tools/git/page/messagePanel';
import { HistoryMenu, NavButtons } from '../../tools/git/page/navBar';
import { FileRow } from '../../lib/page/tree';
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
  readonly hideDimmed?: boolean;
}

export function CommitRowShown({
  refs = [],
  stash = false,
  detached = false,
  head,
  headCommit,
  hideDimmed = false,
  ...props
}: RowShown) {
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
        hideDimmed,
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
    <WorkingTreeRow
      count={count}
      selection={undefined}
      indent={0}
      onSelect={noop}
    />
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
    <FileRow
      path="src/a.ts"
      name="a.ts"
      depth={1}
      change={change}
      selected={undefined}
      marked={chosen}
      onSelect={noop}
    />
  );
}

export function FolderRowShown() {
  return (
    <ChangesTreeItem
      row={{
        kind: 'folder',
        name: 'src',
        path: 'src',
        depth: 0,
        open: true,
        changed: true,
      }}
      {...{
        showsAll: false,
        onToggle: noop,
        selected: undefined,
        onSelect: noop,
        cursor: undefined,
      }}
    />
  );
}

export function HistoryMenuShown() {
  return (
    <HistoryMenu
      container={{ current: null }}
      entries={[{ hash: 'a', subject: 'a' }]}
      onPick={noop}
      onClose={noop}
    />
  );
}

const bookmarks: readonly Bookmark[] = [
  { kind: 'commit', name: 'abcdef1' },
  { kind: 'branch', name: 'gone' },
];

export function LocationsPopupShown({
  query,
  commitSearch,
  head = repository.head,
}: {
  readonly query: string;
  readonly commitSearch?: GitToWebviewOf<'commitSearch'>;
  readonly head?: string;
}) {
  return (
    <GitStore
      value={createGitStore(noop, {
        tab: {
          ...emptyTabView,
          root: '/repo',
          repository: { ...repository, head },
          commitSearch,
        },
        bookmarks,
        searching: new Set(['/repo']),
        searches: new Map([['/repo', { query, options: plainSearch }]]),
      })}
    >
      <LocationsPopup anchor={{ current: null }} />
    </GitStore>
  );
}

export function CommitsFoundShown({ query }: { readonly query: string }) {
  return (
    <LocationsPopupShown
      query={query}
      commitSearch={{
        type: 'commitSearch',
        query,
        options: plainSearch,
        result: {
          commits: [
            commitInfo('a', { subject: `${query} a` }),
            commitInfo('b', { subject: `${query} b` }),
          ],
          capped: false,
        },
      }}
    />
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
        <LocationsPopupShown query="" head={checkedOut} />
      </GitStore>
      <GitStore value={store()}>
        <LocationsPopupShown query="m" head={checkedOut} />
      </GitStore>
      <GitStore value={store()}>
        <LocationsPopupShown query="stash" head={checkedOut} />
      </GitStore>
    </>
  );
}
