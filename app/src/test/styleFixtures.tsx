import type {
  Bookmark,
  FileChange,
  GitToWebviewOf,
  RefInfo,
  RepositoryState,
  WorktreeInfo,
} from '../tools/git/shared/protocol';
import { emptyTabView } from '../tools/git/page/tabView';
import type { ColumnName } from '../tools/git/page/activeColumn';
import { changesTreeElement } from '../tools/git/page/changesTree';
import { Column } from '../tools/git/page/column';
import { CommitRow, WorkingTreeRow } from '../tools/git/page/commitList';
import { ContextMenu } from '../ui/contextMenu';
import {
  gitStore,
  inStores,
  optionStores,
  type ShownGit,
  type ShownOptions,
  tabsStore,
} from './componentFixtures';
import { DiffOptions } from '../tools/git/page/diffColumn';
import { FindField, SearchButton } from '../ui/search';
import { gitKeymap } from '../tools/git/page/keymap';
import type { FindRange } from '../shared/textMatches';
import { LocationsPopup } from '../tools/git/page/locations';
import { createGitStore, GitStore } from '../tools/git/page/store';
import {
  MessageBody,
  MessageCorner,
  MessagePanel,
} from '../tools/git/page/messagePeek';
import { Minimap } from '../ui/minimap';
import { HistoryMenu, NavButtons } from '../tools/git/page/navBar';
import { Notices } from '../shell/page/notices';
import { MenuButton } from '../ui/menu';
import { AppMenu } from '../shell/page/appMenu';
import { TabBar } from '../shell/page/tabBar';
import { FileRow } from '../tools/git/page/tree';
import { WorktreeBar } from '../tools/git/page/worktreeBar';
import {
  allWithClass,
  rendered,
  withClass,
  type MarkupElement,
} from './cascade';
import { commitInfo, renderedBy } from './fixtures';
import { createShellStore, ShellStore } from '../shell/page/store';
import { Code, marked } from '../tools/git/page/codeMarks';
import { BreakMarks } from '../tools/git/page/wrapMarks';
import { diffRowClass } from '../tools/git/page/diffRowParts';
import { DiffView } from '../tools/git/page/diffView';

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
    <div className={className} data-active-column={active}>
      {[0, 1, 2].map((index) => (
        <Column key={index} index={index < 2 ? index : undefined}>
          {null}
        </Column>
      ))}
    </div>,
  );
}

export function navButtons({
  fetching = false,
  ...shown
}: ShownGit & { readonly fetching?: boolean } = {}): React.ReactElement {
  return (
    <GitStore value={gitStore({ ...shown, tab: { fetching } })}>
      <NavButtons />
    </GitStore>
  );
}

export function diffOptions(shown: ShownOptions = {}): React.ReactElement {
  return inStores(optionStores(shown), <DiffOptions language={undefined} />);
}

export function menuButton(
  props: Partial<React.ComponentProps<typeof MenuButton>> = {},
) {
  return <MenuButton title="" items={[]} {...props} />;
}

export const tabBar = memoized(() =>
  rendered(
    <ShellStore
      value={tabsStore(
        [
          { id: '/a', tool: 'git', root: '/a', name: 'a' },
          { id: '/x/b', tool: 'git', root: '/x/b', name: 'b', folder: 'x' },
        ],
        '/a',
        false,
      )}
    >
      <TabBar menu={<AppMenu />} />
    </ShellStore>,
  ),
);

export const worktree = (name: string): WorktreeInfo => ({
  root: `/${name}`,
  name,
  folder: name,
  main: false,
  missing: false,
});

export function worktreeBar(
  worktrees: readonly WorktreeInfo[] | undefined,
  active?: string,
) {
  return rendered(
    <GitStore
      value={gitStore({
        ...(worktrees && { worktrees }),
        tab: { ...(active !== undefined && { root: active }) },
      })}
    >
      <WorktreeBar />
    </GitStore>,
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

export function commitRow({
  refs = [],
  stash = false,
  detached = false,
  head,
  headCommit,
  hideDimmed = false,
  ...props
}: RowShown = {}): React.ReactElement {
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

export function messagePanel(
  props: RowShown = {},
  pinned = false,
): MarkupElement {
  return rendered(
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
      {commitRow({
        indent: 8,
        corner: <MessageCorner onUnpin={pinned ? noop : undefined} />,
        children: <MessageBody text="Body" />,
        ...props,
      })}
    </MessagePanel>,
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
    <ShellStore
      value={createShellStore(noop, {
        notices: [
          {
            id: 1,
            level: level === 'info' ? 'info' : 'error',
            message: 'failed',
            shownAt: 0,
          },
        ],
      })}
    >
      <Notices />
    </ShellStore>,
  ),
);

export const repository: RepositoryState = {
  head: 'main',
  headCommit: 'a',
  refs: [
    { kind: 'branch', name: 'main', commit: 'a' },
    { kind: 'remote', name: 'origin/main', commit: 'a' },
    { kind: 'tag', name: 'v1', commit: 'a' },
    { kind: 'remote-tag', name: 'origin/v1', commit: 'a', remote: 'origin' },
  ],
  stashes: [{ name: 'stash@{0}', commit: 'b', message: 'WIP on main' }],
};

const bookmarks: readonly Bookmark[] = [
  { kind: 'commit', name: 'abcdef1' },
  { kind: 'branch', name: 'gone' },
];

function locationsPopupElement(
  query: string,
  commitSearch?: GitToWebviewOf<'commitSearch'>,
  head: string | undefined = repository.head,
): React.ReactElement {
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
        searching: true,
        searchQueries: new Map([['/repo', query]]),
      })}
    >
      <LocationsPopup anchor={{ current: null }} />
    </GitStore>
  );
}

export const locationsPopup = memoized((query) =>
  rendered(locationsPopupElement(query)),
);

export const commitsFound = memoized((query) =>
  rendered(
    locationsPopupElement(query, {
      type: 'commitSearch',
      query,
      result: {
        commits: [
          commitInfo('a', { subject: `${query} a` }),
          commitInfo('b', { subject: `${query} b` }),
        ],
        capped: false,
      },
    }),
  ),
);

export const searchButton = memoized(() =>
  rendered(<SearchButton title="Search" onClick={noop} />),
);

export const diffFind = memoized((query) =>
  rendered(
    <FindField
      query={query}
      count=""
      keys={gitKeymap}
      onQuery={noop}
      onStep={noop}
      onClose={noop}
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
      scroller={{ current: null }}
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
  return <div className={diffRowClass(split ? 'split' : 'line')}>{node}</div>;
}

export function inlineLine(
  kind: 'context' | 'added' | 'removed',
  {
    words = [],
    finds = [],
    current,
    marker = false,
    whole = false,
  }: {
    words?: readonly FindRange[];
    finds?: readonly FindRange[];
    current?: FindRange;
    marker?: boolean;
    whole?: boolean;
  } = {},
): React.ReactElement {
  return diffRow(
    <div
      className={`diff-line text-line ${kind} ${whole ? 'whole-change' : ''}`}
    >
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

export function indentedLine(): React.ReactElement {
  return diffRow(
    <div className="diff-line text-line added">
      <span className="number">1</span>
      <span className="number">1</span>
      <Code
        text="  a"
        syntax={[]}
        words={[]}
        wordClass="word-added"
        finds={[]}
        current={undefined}
        whitespace
        indent={2}
      />
    </div>,
  );
}

export function hangingSpacesLine(): React.ReactElement {
  return diffRow(
    <div className="diff-line text-line added">
      <span className="number">1</span>
      <span className="number">1</span>
      <Code
        text="a   b"
        syntax={[]}
        words={[]}
        wordClass="word-added"
        finds={[]}
        current={undefined}
        whitespace={false}
      />
      <span className="wrap-marks">
        <BreakMarks
          breaks={[
            {
              end: 4,
              blanks: [1, 2, 3].map((column) => ({ column, tab: false })),
            },
          ]}
          numbers={2}
          lineHeight={18}
        />
      </span>
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
  { sideBySide = false, wordWrap = false, showWhitespace = false } = {},
  ...rows: React.ReactElement[]
): MarkupElement {
  const view = rendered(
    inStores(
      optionStores({
        layout: sideBySide ? 'sideBySide' : 'inline',
        wordWrap,
        showWhitespace,
      }),
      <DiffView
        error={null}
        files={[]}
        whole={undefined}
        origin={undefined}
        loading={false}
        diff={1}
        onLoad={noop}
        texts={new Map()}
        onLoadTexts={noop}
        changeMarks
        matches={[]}
        current={0}
        jump={0}
        firstChange={undefined}
      />,
    ),
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
    commitRow({
      refs: repository.refs,
      stash: true,
      selected: 'a',
      head: checkedOut,
    }),
    commitRow({ refs: repository.refs, detached: true }),
    locationsPopupElement('', undefined, checkedOut),
    locationsPopupElement('m', undefined, checkedOut),
    locationsPopupElement('stash', undefined, checkedOut),
  ].flatMap((node) =>
    allWithClass(
      rendered(
        <GitStore
          value={gitStore(checkedOut === undefined ? {} : { head: checkedOut })}
        >
          {node}
        </GitStore>,
      ),
      'badge',
    ),
  );
}
