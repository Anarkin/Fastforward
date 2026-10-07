import type {
  Bookmark,
  FileChange,
  RepositoryState,
  WorktreeInfo,
} from '../shared/protocol';
import type { ColumnName } from '../webview/activeColumn';
import { CheckedOutBranch } from '../webview/bubbles';
import { changesTreeElement } from '../webview/changesTree';
import { Column } from '../webview/column';
import { ColumnResizingProvider } from '../webview/columns';
import { CommitRow, WorkingTreeRow } from '../webview/commitList';
import { ContextMenu } from '../webview/contextMenu';
import { DiffFind, DiffOptions } from '../webview/diffColumn';
import { DiffView, marked } from '../webview/diffView';
import type { FindRange } from '../webview/find';
import { LocationsPopup } from '../webview/locations';
import { Minimap } from '../webview/minimap';
import { AddressBar, HistoryMenu, NavButtons } from '../webview/navBar';
import { Notices } from '../webview/notices';
import { TabBar } from '../webview/tabBar';
import { FileRow } from '../webview/tree';
import { WorktreeBar } from '../webview/worktreeBar';
import {
  allWithClass,
  rendered,
  withClass,
  type MarkupElement,
} from './cascade';
import { commitInfo, renderedBy } from './fixtures';

const noop = () => undefined;

function memoized<T>(make: (key: string) => T): (key?: string) => T {
  const made = new Map<string, T>();
  return (key = '') => {
    const known = made.get(key);
    if (known !== undefined) {
      return known;
    }
    const value = make(key);
    made.set(key, value);
    return value;
  };
}

export function columnTitle(start: React.ReactNode): MarkupElement {
  return withClass(
    rendered(renderedBy(Column, { start, children: null })),
    'column-title',
  );
}

export function columns(className: string, active?: ColumnName) {
  return rendered(
    <ColumnResizingProvider value={{ start: noop, reset: noop }}>
      <div className={className} data-active-column={active}>
        {[0, 1, 2].map((index) => (
          <Column key={index} index={index < 2 ? index : undefined}>
            {null}
          </Column>
        ))}
      </div>
    </ColumnResizingProvider>,
  );
}

export function navButtons(
  props: Partial<Parameters<typeof NavButtons>[0]> = {},
): React.ReactElement {
  return (
    <NavButtons
      back={[]}
      forward={[]}
      onNavigate={noop}
      fetching={false}
      onFetch={noop}
      autoFetch={false}
      autoFetchMinutes={0}
      onAutoFetch={noop}
      lastFetch={{}}
      {...props}
    />
  );
}

export function diffOptions(
  props: Partial<Parameters<typeof DiffOptions>[0]> = {},
): React.ReactElement {
  return (
    <DiffOptions
      entire={false}
      pinned={false}
      canShow
      ignoreWhitespace={false}
      wordWrap={false}
      onEntire={noop}
      onPin={noop}
      onIgnoreWhitespace={noop}
      onWordWrap={noop}
      layout="inline"
      onLayout={noop}
      {...props}
    />
  );
}

export const tabBar = memoized(() =>
  rendered(
    <TabBar
      tabs={[
        { root: '/a', name: 'a' },
        { root: '/b', name: 'b' },
      ]}
      active="/a"
      onSelect={noop}
      onPreload={noop}
      onClose={noop}
      onAdd={noop}
      onSort={noop}
      onOpenSettings={noop}
      onOpenDefaultSettings={noop}
      onShowShortcuts={noop}
      onLog={noop}
    />,
  ),
);

export const worktree = (name: string): WorktreeInfo => ({
  root: `/${name}`,
  name,
  folder: name,
  main: false,
  missing: false,
});

export function worktreeBar(worktrees: readonly WorktreeInfo[] | undefined) {
  return rendered(
    <WorktreeBar
      worktrees={worktrees}
      active={undefined}
      onSelect={noop}
      onPreload={noop}
    />,
  );
}

export function commitRow(
  props: Partial<Parameters<typeof CommitRow>[0]> = {},
): React.ReactElement {
  return (
    <CommitRow
      commit={commitInfo('a')}
      selected={undefined}
      headCommit={undefined}
      refs={[]}
      detached={false}
      indent={0}
      onSelect={noop}
      {...props}
    />
  );
}

export function workingTreeRow(count: number): MarkupElement {
  return rendered(
    <WorkingTreeRow
      count={count}
      selection={undefined}
      indent={0}
      onSelect={noop}
    />,
  );
}

export function fileRow(
  change: FileChange | undefined,
  chosen = false,
): MarkupElement {
  return rendered(
    <FileRow
      path="src/a.ts"
      name="a.ts"
      depth={1}
      change={change}
      selected={undefined}
      marked={chosen}
      onSelect={noop}
    />,
  );
}

export function folderRow(): MarkupElement {
  return rendered(
    changesTreeElement(
      {
        kind: 'folder',
        name: 'src',
        path: 'src',
        depth: 0,
        open: true,
        changed: true,
      },
      {
        showsAll: false,
        onToggle: noop,
        selected: undefined,
        onSelect: noop,
        cursor: undefined,
      },
    ),
  );
}

export const contextMenu = memoized(() =>
  rendered(
    <ContextMenu
      menu={{
        x: 0,
        y: 0,
        items: [
          { label: 'Check out' },
          { separator: true },
          { label: 'Delete', disabled: true },
        ],
      }}
      onClose={noop}
    />,
  ),
);

export const historyMenu = memoized(() =>
  rendered(
    <HistoryMenu
      container={{ current: null }}
      entries={[{ hash: 'a', subject: 'a' }]}
      onPick={noop}
      onClose={noop}
    />,
  ),
);

export const notices = memoized((level) =>
  rendered(
    <Notices
      notices={[
        {
          id: 1,
          level: level === 'info' ? 'info' : 'error',
          message: 'failed',
          shownAt: 0,
        },
      ]}
      onDismiss={noop}
    />,
  ),
);

export const repository: RepositoryState = {
  head: 'main',
  headCommit: 'a',
  refs: [
    { kind: 'branch', name: 'main', commit: 'a' },
    { kind: 'remote', name: 'origin/main', commit: 'a' },
    { kind: 'tag', name: 'v1', commit: 'a' },
  ],
  stashes: [{ name: 'stash@{0}', commit: 'b', message: 'WIP on main' }],
};

const bookmarks: readonly Bookmark[] = [
  { kind: 'commit', name: 'abcdef1' },
  { kind: 'branch', name: 'gone' },
];

function locationsPopupElement(query: string): React.ReactElement {
  return (
    <LocationsPopup
      bookmarks={bookmarks}
      repository={repository}
      anchor={{ current: null }}
      lookup={undefined}
      onLookup={noop}
      commitSearch={undefined}
      onSearchCommits={noop}
      onJump={noop}
      onClose={noop}
      query={query}
      onQuery={noop}
    />
  );
}

export const locationsPopup = memoized((query) =>
  rendered(locationsPopupElement(query)),
);

export const addressBar = memoized(() =>
  rendered(
    <AddressBar
      root="/a"
      repository={undefined}
      hashLookup={undefined}
      onLookupHash={noop}
      commitSearch={undefined}
      onSearchCommits={noop}
      onJump={noop}
      bookmarks={[]}
    />,
  ),
);

export const diffFind = memoized((query) =>
  rendered(
    <DiffFind
      query={query}
      count=""
      unsearched={0}
      onQuery={noop}
      onStep={noop}
    />,
  ),
);

export const minimap = memoized(() =>
  rendered(
    <Minimap
      marks={[
        { kind: 'added', top: 0, height: 0.1 },
        { kind: 'removed', top: 0.2, height: 0.1 },
        { kind: 'match', top: 0.4, height: 0.1 },
      ]}
      scrollTop={0}
      viewport={10}
      total={100}
      onScroll={noop}
    />,
  ),
);

export function diffRow(
  node: React.ReactNode,
  split = false,
): React.ReactElement {
  return (
    <div className={`virtual-row diff-row ${split ? 'split-row' : ''}`}>
      {node}
    </div>
  );
}

export function inlineLine(
  kind: 'context' | 'added' | 'removed',
  {
    words = [],
    finds = [],
    current,
    marker = false,
  }: {
    words?: readonly FindRange[];
    finds?: readonly FindRange[];
    current?: FindRange;
    marker?: boolean;
  } = {},
): React.ReactElement {
  return diffRow(
    <div className={`diff-line text-line ${kind}`}>
      <span className="number">1</span>
      <span className="number">1</span>
      <span className="code">
        {marked(
          'a b c',
          [],
          words,
          kind === 'removed' ? 'word-removed' : 'word-added',
          finds,
          current,
        )}
      </span>
      {marker && <button className={`hidden-change left ${kind}`} />}
    </div>,
  );
}

export function splitLine(left: string, right: string): React.ReactElement {
  return diffRow(
    <div className="split-line">
      {[left, right].map((change, side) => (
        <div key={side} className={`diff-line text-line split-side ${change}`}>
          <span className="number">1</span>
          <span className="split-code">
            {change !== 'filler' && <span className="code">a</span>}
          </span>
        </div>
      ))}
    </div>,
    true,
  );
}

export function diffView(
  { sideBySide = false, wordWrap = false } = {},
  ...rows: React.ReactElement[]
): MarkupElement {
  const view = rendered(
    <DiffView
      error={null}
      files={[]}
      whole={undefined}
      loading={false}
      diff={1}
      onLoad={noop}
      texts={new Map()}
      onLoadTexts={noop}
      changeMarks
      matches={[]}
      current={0}
      jump={0}
      sideBySide={sideBySide}
      wordWrap={wordWrap}
    />,
  );
  const spacer = withClass(view, 'virtual-spacer');
  for (const row of rows) {
    rendered(row, spacer);
  }
  return view;
}

export function shownRow(view: MarkupElement): MarkupElement {
  return withClass(view, 'virtual-row', 'diff-row');
}

export function bubbles(checkedOut?: string): MarkupElement[] {
  return [
    commitRow({ refs: repository.refs, stash: true, selected: 'a' }),
    commitRow({ refs: repository.refs, detached: true }),
    locationsPopupElement(''),
    locationsPopupElement('m'),
    locationsPopupElement('stash'),
  ].flatMap((node) =>
    allWithClass(
      rendered(
        <CheckedOutBranch.Provider value={checkedOut}>
          {node}
        </CheckedOutBranch.Provider>,
      ),
      'badge',
    ),
  );
}
