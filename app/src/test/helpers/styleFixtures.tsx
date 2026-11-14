import type {
  Bookmark,
  FileChange,
  GitToWebviewOf,
  RefInfo,
  WorktreeInfo,
} from '../../tools/git/shared/protocol';
import { emptyTabView } from '../../tools/git/page/tabView';
import type { ColumnName } from '../../tools/git/page/activeColumn';
import { ChangesTreeItem } from '../../tools/git/page/changesTree';
import { Column } from '../../tools/git/page/column';
import {
  CommitRow,
  SoloButton,
  WorkingTreeRow,
} from '../../tools/git/page/commitList';
import { ContextMenu } from '../../lib/page/contextMenu';
import {
  gitStore,
  inStores,
  optionStores,
  type ShownGit,
  type ShownOptions,
  tabsStore,
} from './componentFixtures';
import { DiffOptions } from '../../tools/git/page/diffColumn';
import { FindField, SearchButton } from '../../lib/page/search';
import { gitKeymap } from '../../tools/git/page/keymap';
import type { FindRange } from '../../lib/shared/textMatches';
import { LocationsPopup } from '../../tools/git/page/locations';
import { createGitStore, GitStore } from '../../tools/git/page/store';
import {
  MessageBody,
  MessageCorner,
  MessagePanel,
} from '../../tools/git/page/messagePeek';
import { Minimap } from '../../tools/git/page/minimap';
import { HistoryMenu, NavButtons } from '../../tools/git/page/navBar';
import { Notices } from '../../shell/page/notices';
import { MenuButton } from '../../lib/page/menu';
import { AppMenu } from '../../shell/page/appMenu';
import { TabBar } from '../../shell/page/tabBar';
import { FileRow } from '../../tools/git/page/tree';
import { WorktreeBar } from '../../tools/git/page/worktreeBar';
import { commitInfo } from './fixtures';
import { createShellStore, ShellStore } from '../../shell/page/store';
import { Code, MarkedCode } from '../../tools/git/page/codeMarks';
import { BreakMarks } from '../../tools/git/page/wrapMarks';
import { diffRowClass } from '../../tools/git/page/diffRowClasses';
import { DiffView } from '../../tools/git/page/diffView';
import { repository } from './styleMarkup';
import { AboutPopup } from '../../shell/page/aboutPopup';
import { ShortcutsPopup } from '../../shell/page/shortcutsPopup';
import { GraphCell } from '../../tools/git/page/graph';
import {
  bubbleLineHeight,
  commitRowHeight,
} from '../../tools/git/page/commitListRows';
import { FileHeader } from '../../tools/git/page/diffRowParts';
import { MarkBox } from '../../tools/commander/page/paneCells';
import { PathTitle } from '../../tools/commander/page/pathTitle';

const noop = () => undefined;

export function ColumnShown({ start }: { readonly start: React.ReactNode }) {
  return <Column start={start}>{null}</Column>;
}

export function Columns({
  className,
  active,
}: {
  readonly className: string;
  readonly active?: ColumnName;
}) {
  return (
    <div className={className} data-active-column={active}>
      {[0, 1, 2].map((index) => (
        <Column key={index} index={index < 2 ? index : undefined}>
          {null}
        </Column>
      ))}
    </div>
  );
}

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

export function DiffOptionsShown(shown: ShownOptions) {
  return inStores(optionStores(shown), <DiffOptions language={undefined} />);
}

export function MenuButtonShown(
  props: Partial<React.ComponentProps<typeof MenuButton>>,
) {
  return <MenuButton title="" items={[]} {...props} />;
}

export function TabBarShown() {
  return (
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
    </ShellStore>
  );
}

export function TabBarIn({
  maximized,
  adding = false,
}: {
  readonly maximized: boolean;
  readonly adding?: boolean;
}) {
  return (
    <div {...(maximized ? { 'data-maximized': '' } : {})}>
      <ShellStore
        value={tabsStore(
          [
            { id: '/a', tool: 'git', root: '/a', name: 'a' },
            { id: '/b', tool: 'git', root: '/b', name: 'b' },
          ],
          '/a',
          adding,
        )}
      >
        <TabBar />
      </ShellStore>
    </div>
  );
}

export function TabRow({
  count,
  active,
}: {
  readonly count: number;
  readonly active: string;
}) {
  return (
    <ShellStore
      value={tabsStore(
        ['a', 'b', 'c'].slice(0, count).map((name) => ({
          id: `/${name}`,
          tool: 'git' as const,
          root: `/${name}`,
          name,
        })),
        active,
      )}
    >
      <TabBar />
    </ShellStore>
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

export function GraphBesideCommit({
  selected,
}: {
  readonly selected?: string;
}) {
  return (
    <div className="virtual-row">
      <GraphCell
        row={{ lane: 0, color: 0, lines: [] }}
        height={commitRowHeight}
        line={bubbleLineHeight}
        onToggleMerge={noop}
      />
      <CommitRowShown selected={selected} />
    </div>
  );
}

export function SoloButtonShown({
  solo,
  applying,
}: {
  readonly solo: boolean;
  readonly applying: boolean;
}) {
  return (
    <GitStore
      value={createGitStore(noop, {
        solo,
        tab: { ...emptyTabView, applyingSolo: applying },
      })}
    >
      <SoloButton />
    </GitStore>
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

export function ContextMenuShown() {
  return (
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

export function NoticesShown({ level }: { readonly level?: string }) {
  return (
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
    </ShellStore>
  );
}

export function AboutPopupShown() {
  return (
    <ShellStore
      value={createShellStore(noop, {
        about: {
          version: '1.0.0',
          development: false,
          git: '2.52.0',
          system: 'Linux 6.8.0, x64',
        },
      })}
    >
      <AboutPopup />
    </ShellStore>
  );
}

export function ShortcutsPopupShown() {
  return (
    <ShellStore
      value={tabsStore([{ id: '1', tool: 'git', name: 'repo' }], '1')}
    >
      <ShortcutsPopup />
    </ShellStore>
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
        searching: true,
        searchQueries: new Map([['/repo', query]]),
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

export function SearchButtonShown() {
  return <SearchButton title="Search" onClick={noop} />;
}

export function DiffFindShown({ query = '' }: { readonly query?: string }) {
  return (
    <FindField
      query={query}
      count=""
      keys={gitKeymap}
      onQuery={noop}
      onStep={noop}
      onClose={noop}
    />
  );
}

export function MinimapShown() {
  return (
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
    />
  );
}

export function DiffRow({
  split = false,
  children,
}: {
  readonly split?: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <div className={diffRowClass(split ? 'split' : 'line')}>{children}</div>
  );
}

export function FileHeaderRow() {
  return (
    <DiffRow>
      <FileHeader path="a" open whole={false} collapsible onClick={noop} />
    </DiffRow>
  );
}

export function InlineLine({
  kind,
  words = [],
  finds = [],
  current,
  marker = false,
  whole = false,
}: {
  readonly kind: 'context' | 'added' | 'removed';
  readonly words?: readonly FindRange[];
  readonly finds?: readonly FindRange[];
  readonly current?: FindRange;
  readonly marker?: boolean;
  readonly whole?: boolean;
}) {
  return (
    <DiffRow>
      <div
        className={`diff-line text-line ${kind} ${whole ? 'whole-change' : ''}`}
      >
        <span className="number">1</span>
        <span className="number">1</span>
        <span className="code">
          <MarkedCode
            text={'a b c'}
            syntax={[]}
            words={words}
            wordClass={kind === 'removed' ? 'word-removed' : 'word-added'}
            found={finds}
            foundNow={current}
          />
        </span>
        {marker && <button className={`hidden-change left ${kind}`} />}
      </div>
    </DiffRow>
  );
}

export function IndentedLine() {
  return (
    <DiffRow>
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
      </div>
    </DiffRow>
  );
}

export function HangingSpacesLine() {
  return (
    <DiffRow>
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
      </div>
    </DiffRow>
  );
}

export function SplitLine({
  left,
  right,
}: {
  readonly left: string;
  readonly right: string;
}) {
  return (
    <DiffRow split>
      <div className="split-line">
        {[left, right].map((change, side) => (
          <div
            key={side}
            className={`diff-line text-line split-side ${change}`}
          >
            <span className="number">1</span>
            <span className="split-code">
              {change !== 'filler' && <span className="code">a</span>}
            </span>
          </div>
        ))}
      </div>
    </DiffRow>
  );
}

export function DiffViewShown({
  sideBySide = false,
  wordWrap = false,
  showWhitespace = false,
}: {
  readonly sideBySide?: boolean;
  readonly wordWrap?: boolean;
  readonly showWhitespace?: boolean;
}) {
  return inStores(
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
  );
}

export function CommanderItem({
  className,
  paneClassName = '',
}: {
  readonly className: string;
  readonly paneClassName?: string;
}) {
  return (
    <div className={`commander ${paneClassName}`}>
      <div className={`row commander-row ${className}`}>
        <MarkBox onToggle={noop} />
      </div>
    </div>
  );
}

export function PathTitleShown({
  hidden,
  color,
}: {
  readonly hidden: readonly boolean[];
  readonly color?: string;
}) {
  return <PathTitle path="C:/cache/notes.txt" hidden={hidden} color={color} />;
}
