import {
  memo,
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import { comparedOf, shownSide, sidesOf } from '../shared/comparisons';
import {
  workingTreeHash,
  type CommitInfo,
  type RefInfo,
} from '../shared/protocol';
import { CommitBubble, HeadBubble, RefBubble, StashBubble } from './bubbles';
import { Column } from './column';
import { commitMenuTarget, useOpenMenu } from './menus';
import { GraphCell, graphWidth, rowLanes } from './graph';
import {
  detachedHead,
  layoutSelectionOf,
  openingOf,
  useGit,
  useGitActions,
} from './store';
import { listError } from './columns';
import { formatDate } from '../../../lib/page/dates';
import { useShell } from '../../../shell/page/store';
import { MenuButton } from '../../../lib/page/menu';
import { MessageBody, MessagePeek } from './messagePeek';
import { useSkeleton } from './skeleton';
import { Highlight } from '../../../lib/page/highlight';
import {
  clicked,
  menuFromKeyboard,
  type Click,
} from '../../../lib/shared/keymap';
import { gitKeymap } from './keymap';
import { keyPressed } from '../../../lib/page/shortcuts';
import { withoutRemote } from '../shared/refNames';
import { strings } from '../../../lib/shared/strings';
import { Words } from '../../../lib/page/name';
import { columnFocusAttribute } from '../../../lib/page/columnFocus';
import {
  fullyVisible,
  listMoveOf,
  type ListMove,
} from '../../../lib/page/listMoves';
import { SoloIcon } from '../../../lib/page/icons';
import { useCappedScroll } from './cappedVirtualizer';
import { SearchButton } from '../../../lib/page/search';
import { realHeight } from '../../../lib/page/cappedScroll';
import { rowPlace } from '../../../lib/page/rowPlace';
import { watchDevicePixels } from '../../../lib/page/devicePixels';
import {
  activeDescendant,
  endCovered,
  rowId,
} from '../../../lib/page/listRows';

import {
  workingTreeShift,
  ListScrollState,
  listScroll,
  ReportedPlaces,
  movingPlaces,
  useScrollReports,
  atMostEvery,
} from './commitListScrolling';
import {
  keySelection,
  mergeToToggle,
  keyboardMenuTarget,
  withoutWorkingTreeLink,
  PendingKey,
  pendingSelection,
  listKeyPosition,
} from './commitListKeys';
import {
  useRowLineHeight,
  rowSizes,
  rowKeyOf,
  drawnRows,
  fixedRowHeight,
  listTop,
} from './commitListRows';
const loadDelay = 80;

const noHistory = () => () => {};
const noVersion = () => 0;
const noSelect = () => {};
const rowIndent = 8;

const openingRows = 20;

export const noRefs: readonly RefInfo[] = [];

export const CommitBubbles = memo(function CommitBubbles({
  hash,
}: {
  hash: string;
}) {
  const refs = useGit((state) => state.refsByCommit.get(hash) ?? noRefs);
  const stash = useGit((state) => state.stashCommits.has(hash));
  const detached = useGit((state) => detachedHead(state) === hash);
  const bookmarked = useGit((state) => state.bookmarked.has(hash)) && !detached;
  if (!detached && refs.length === 0 && !stash && !bookmarked) {
    return null;
  }
  const bubbles = [
    ...(detached ? [<HeadBubble key="HEAD" hash={hash} />] : []),
    ...inPairs(refs).map((ref) => (
      <RefBubble
        key={`${ref.kind}:${ref.name}`}
        info={ref}
        tracking={ref.tracking}
        actions
      />
    )),
    ...(bookmarked ? [<CommitBubble key="bookmark" hash={hash} />] : []),
    ...(stash ? [<StashBubble key="stash" />] : []),
  ];
  return (
    <div className="bubble-line">
      {bubbles.flatMap((bubble, index) =>
        index === 0 ? [bubble] : [<wbr key={`break:${index}`} />, bubble],
      )}
    </div>
  );
});

function tagOf(ref: RefInfo): string {
  return withoutRemote(ref.name, ref.remote);
}

function inPairs(refs: readonly RefInfo[]): RefInfo[] {
  const remoteTags = refs.filter((ref) => ref.kind === 'remote-tag');
  const localTags = new Set(
    refs.filter((ref) => ref.kind === 'tag').map((ref) => ref.name),
  );
  return [
    ...refs.flatMap((ref) =>
      ref.kind === 'remote-tag'
        ? []
        : ref.kind === 'tag'
          ? [ref, ...remoteTags.filter((other) => tagOf(other) === ref.name)]
          : [ref],
    ),
    ...remoteTags.filter((ref) => !localTags.has(tagOf(ref))),
  ];
}

export function commitMoveOf(
  event: Parameters<typeof listMoveOf>[0],
): ListMove | undefined {
  return listMoveOf(event) ?? keyPressed(gitKeymap.peekStep, event);
}

export function isCompareClick(event: Click): boolean {
  return clicked(gitKeymap.compare, event) !== undefined;
}

function selectionOfRow(
  hash: string,
  selection: string | undefined,
): string | undefined {
  return sidesOf(selection).includes(hash) ? selection : undefined;
}

function selectionClasses(hash: string, selection: string | undefined) {
  if (!sidesOf(selection).includes(hash)) {
    return [];
  }
  return comparedOf(selection)?.from === hash
    ? ['selected', 'compare-from']
    : ['selected'];
}

export function commitOption(
  list: string,
  key: VirtualItem['key'],
  index: number,
  count: number,
  selection: string | undefined,
) {
  return {
    id: rowId(list, key),
    role: 'option',
    'aria-selected':
      typeof key === 'string' && sidesOf(selection).includes(key),
    'aria-setsize': count,
    'aria-posinset': index + 1,
  };
}

export function commitListbox(
  list: string,
  drawn: readonly { readonly key: VirtualItem['key'] }[],
  selection: string | undefined,
) {
  return {
    role: 'listbox',
    'aria-label': strings.commits.list,
    'aria-multiselectable': comparedOf(selection) !== undefined,
    'aria-activedescendant': activeDescendant(
      list,
      shownSide(selection),
      drawn,
    ),
  };
}

export function WorkingTreeRow({
  count,
  selection,
  indent,
  onSelect,
  onCompare,
}: {
  count: number;
  selection: string | undefined;
  indent: number;
  onSelect: (hash: string | undefined) => void;
  onCompare?: (hash: string) => void;
}) {
  const dirty = count > 0;
  return (
    <div
      style={{ paddingLeft: indent }}
      className={`commit working-tree ${dirty ? '' : 'empty'} ${selectionClasses(workingTreeHash, selection).join(' ')}`}
      onClick={(event: Click) =>
        onCompare && isCompareClick(event)
          ? onCompare(workingTreeHash)
          : onSelect(workingTreeHash)
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

export function Commits({
  navigation,
  search,
}: {
  navigation?: React.ReactNode;
  search?: React.ReactNode;
}) {
  const history = useGit((state) => state.tab.history);
  const worktree = useGit((state) => state.tab.root);
  const opening = useGit(openingOf);
  const scrollTarget = useGit((state) => state.tab.scrollTarget);
  const workingTree = useGit((state) => state.tab.workingTree);
  const stashes = useGit((state) => state.stashCommits);
  const selected = useGit((state) => state.tab.hash);
  const collapseMerges = useGit((state) => state.collapseMerges);
  const headCommit = useGit((state) => state.tab.repository?.headCommit);
  const searching = useGit((state) => state.searching);
  const error = useGit((state) =>
    listError(state.tab.error, layoutSelectionOf(state)),
  );
  const {
    selectCommit: onSelect,
    compareCommit: onCompare,
    toggleMerge: onToggleMerge,
    changeCollapseMerges: onCollapseMerges,
    scrolled: reportScrolled,
    loadCommits: onLoad,
    search: openSearch,
  } = useGitActions();
  const onScrolled = useCallback(
    (top: string, offset: number, report: number) =>
      reportScrolled(worktree, top, offset, report),
    [reportScrolled, worktree],
  );
  const focusKey = worktree;
  const version = useSyncExternalStore(
    history?.subscribe ?? noHistory,
    history?.getVersion ?? noVersion,
  );
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  const hasWorkingTree = workingTree !== undefined;
  const openMenu = useOpenMenu();
  const offset = hasWorkingTree ? 1 : 0;
  const skeleton = useSkeleton(opening);
  const count = offset + (history?.total ?? (skeleton ? openingRows : 0));

  const [scale, setScale] = useState(() => window.devicePixelRatio);
  useEffect(
    () => watchDevicePixels(() => setScale(window.devicePixelRatio)),
    [],
  );
  const line = useRowLineHeight(list, scale);
  const sizes = useMemo(
    () => rowSizes(history, offset, line, scale),
    [history, offset, line, scale],
  );
  const rowKey = useCallback(
    (index: number) => rowKeyOf(history, offset, index),
    [history, offset],
  );
  const { scrolling, shift, scrollTop, resized } =
    useCappedScroll<HTMLDivElement>();
  const [places] = useState(() => new ReportedPlaces());
  const [scrollToFn] = useState(() =>
    movingPlaces(places, scrolling.scrollToFn),
  );
  const [endPadding, setEndPadding] = useState(0);
  useLayoutEffect(() => setEndPadding(endCovered(list.current)), [line]);
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => list.current,
    ...sizes,
    getItemKey: rowKey,
    overscan: 10,
    scrollPaddingEnd: endPadding,
    ...scrolling,
    scrollToFn,
  });
  const totalSize = virtualizer.getTotalSize();
  useLayoutEffect(resized, [resized, totalSize]);
  useLayoutEffect(() => virtualizer.measure(), [virtualizer, line]);
  const rows = drawnRows(virtualizer, rowKey);
  const first = Math.max(0, (rows[0]?.index ?? 0) - offset);
  const last = Math.max(0, (rows.at(-1)?.index ?? 0) - offset);

  const inView = useRef({ history, first, last, onLoad });
  const [asking] = useState(() =>
    atMostEvery(() => {
      const {
        history: shown,
        first: top,
        last: bottom,
        onLoad: load,
      } = inView.current;
      if (!shown) {
        return;
      }
      for (const run of shown.takeMissingRuns(top, bottom)) {
        load(run.start, run.count, shown.generation);
      }
    }, loadDelay),
  );
  useEffect(() => {
    inView.current = { history, first, last, onLoad };
    if (history) {
      asking.schedule();
    }
  }, [history, first, last, onLoad, asking]);
  useEffect(() => () => asking.cancel(), [asking]);

  const shown = useRef<ListScrollState>({ target: undefined, offset });
  const placesWorktree = useRef(worktree);
  useEffect(() => {
    if (placesWorktree.current !== worktree) {
      placesWorktree.current = worktree;
      places.forget();
      virtualizer.scrollToOffset(0);
    } else if (!history) {
      places.forget();
    }
  }, [history, worktree, places, virtualizer]);
  useEffect(() => {
    const next = { target: history ? scrollTarget : undefined, offset };
    const previous = shown.current;
    shown.current = next;
    const action = listScroll(previous, next);
    if (action === undefined) {
      return;
    }
    if ('shiftBy' in action) {
      const element = list.current;
      if (!element) {
        return;
      }
      const top = scrollTop(element);
      const shifted = workingTreeShift(top, action.shiftBy, line);
      if (shifted !== undefined) {
        places.moved(shifted - top);
        virtualizer.scrollToOffset(shifted);
      }
      return;
    }
    const index = offset + action.target.index;
    if (action.target.offset !== undefined) {
      const [start] = virtualizer.getOffsetForIndex(index, 'start') ?? [];
      if (start !== undefined) {
        virtualizer.scrollToOffset(
          places.kept(
            start,
            action.target.offset,
            scrollTop(list.current),
            action.target.report,
            virtualizer.getTotalSize() - (list.current?.clientHeight ?? 0),
          ),
        );
      }
      return;
    }
    const onScreen = virtualizer
      .getVirtualItems()
      .some((row) => row.index === index);
    virtualizer.scrollToIndex(index, { align: onScreen ? 'auto' : 'center' });
  }, [history, scrollTarget, offset, virtualizer, scrollTop, places, line]);

  const topNow = useCallback(() => {
    const element = list.current;
    if (!element || !history) {
      return undefined;
    }
    const scrolled = scrollTop(element);
    const top = listTop(
      virtualizer.getVirtualItems(),
      scrolled,
      history,
      offset,
    );
    return () => {
      if (top) {
        onScrolled(top.hash, top.offset, places.told(scrolled));
      }
      return top !== undefined;
    };
  }, [history, offset, onScrolled, virtualizer, scrollTop, places]);
  const reportUntold = useScrollReports(list, topNow);
  useEffect(reportUntold, [version, reportUntold]);

  const pending = useRef<PendingKey>(undefined);
  useEffect(() => {
    pending.current = undefined;
  }, [selected, history]);
  useEffect(() => {
    const selection = pendingSelection(pending.current, history, selected);
    if (selection !== null) {
      pending.current = undefined;
      if (selection !== undefined) {
        onSelect(selection.hash, true, selection.repeat);
      }
    }
  });
  const takeKeyboard = useEffectEvent(() => {
    if (!searching) {
      list.current?.focus({ preventScroll: true });
    }
  });
  useEffect(() => {
    if (focusKey !== undefined) {
      takeKeyboard();
    }
  }, [focusKey]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (keyPressed(gitKeymap.merge, event)) {
      event.preventDefault();
      const merge = history && mergeToToggle(history, selected);
      if (merge !== undefined) {
        onToggleMerge(merge);
      }
      return;
    }
    const move = commitMoveOf(event);
    if (!history || move === undefined) {
      return;
    }
    event.preventDefault();
    const element = list.current;
    const position = listKeyPosition(
      move,
      history,
      selected,
      hasWorkingTree,
      fullyVisible(
        virtualizer.getVirtualItems(),
        scrollTop(element),
        (element?.clientHeight ?? 0) - endPadding,
        offset,
      ),
      headCommit,
      pending.current?.history === history
        ? pending.current.position
        : undefined,
    );
    if (position === undefined) {
      return;
    }
    const hash = keySelection(history, position, selected);
    pending.current =
      hash === null ? { history, position, repeat: event.repeat } : undefined;
    if (hash) {
      onSelect(hash, true, event.repeat);
    }
    virtualizer.scrollToIndex(offset + position, { align: 'auto' });
  };

  const graphOf = (index: number) => {
    if (hasWorkingTree && index === 0) {
      return history?.workingTreeGraph;
    }
    const row = history?.graphAt(index - offset);
    return row && !hasWorkingTree && headCommit !== undefined
      ? withoutWorkingTreeLink(row, index, history?.positionOf(headCommit))
      : row;
  };

  const renderGraph = (index: number, height: number) => {
    const graphRow = graphOf(index);
    return (
      graphRow && (
        <GraphCell
          row={graphRow}
          height={height}
          line={line}
          hash={history?.at(index - offset)?.hash}
          scale={scale}
          onToggleMerge={onToggleMerge}
        />
      )
    );
  };

  const indent = (index: number) =>
    graphWidth(rowLanes(graphOf(index))) + rowIndent;

  const renderRow = (index: number) => {
    if (hasWorkingTree && index === 0) {
      return (
        <WorkingTreeRow
          count={workingTree}
          selection={selected}
          indent={indent(index)}
          onSelect={onSelect}
          onCompare={onCompare}
        />
      );
    }
    const position = index - offset;
    const commit = history?.at(position);
    if (!commit) {
      return (
        <div
          className="commit placeholder"
          style={{ paddingLeft: indent(index) }}
        >
          <div className="commit-line">
            <span className="bar subject-bar" />
          </div>
          <div className="commit-line secondary">
            <span className="bar author-bar" />
          </div>
        </div>
      );
    }
    return (
      <ListedCommitRow
        commit={commit}
        selected={selectionOfRow(commit.hash, selected)}
        indent={indent(index)}
        onSelect={onSelect}
        onCompare={onCompare}
      />
    );
  };

  return (
    <Column
      overlay={search}
      search={
        <SearchButton
          title={strings.actions.search}
          onClick={() => openSearch(true)}
        />
      }
      index={0}
      start={navigation}
      actions={
        <>
          <SoloButton />
          <MenuButton
            title={strings.commits.settings}
            items={[
              {
                label: strings.commits.collapseMerges,
                checked: collapseMerges,
                onClick: () => onCollapseMerges(!collapseMerges),
              },
            ]}
          />
        </>
      }
    >
      {error !== undefined && (
        <div className="error-message">
          <Words>{error}</Words>
        </div>
      )}
      <div
        className="virtual-rows list commit-rows"
        ref={list}
        tabIndex={0}
        {...{ [columnFocusAttribute]: '' }}
        {...commitListbox(listId, rows, selected)}
        onKeyDown={onKeyDown}
        onContextMenu={(event) => {
          const target = keyboardMenuTarget(selected, stashes);
          if (
            event.target !== event.currentTarget ||
            !menuFromKeyboard(event) ||
            !target
          ) {
            return;
          }
          const box = (
            event.currentTarget.querySelector('.commit.selected') ??
            event.currentTarget
          ).getBoundingClientRect();
          openMenu(
            {
              stopPropagation: () => event.stopPropagation(),
              preventDefault: () => event.preventDefault(),
              clientX: box.left,
              clientY: box.bottom,
            },
            target,
          );
        }}
      >
        <div
          className="virtual-spacer"
          style={{ height: realHeight(virtualizer.getTotalSize()) }}
        >
          {rows.map((row) => {
            const height = fixedRowHeight(history, offset, row.index, row.size);
            return (
              <div
                key={row.key}
                {...commitOption(listId, row.key, row.index, count, selected)}
                className="virtual-row"
                data-index={row.index}
                ref={
                  height === undefined ? virtualizer.measureElement : undefined
                }
                style={rowPlace(row.start - shift, height)}
              >
                {renderGraph(row.index, row.size)}
                {renderRow(row.index)}
              </div>
            );
          })}
        </div>
      </div>
      <MessagePeek
        key={worktree}
        list={list}
        commitAt={(index) =>
          index < offset ? undefined : history?.at(index - offset)
        }
        indent={rowIndent}
        renderRow={(commit, corner) => (
          <CommitRow
            corner={corner}
            commit={commit}
            selected={selected}
            indent={rowIndent}
            onSelect={noSelect}
          >
            <MessageBody text={commit.body} />
          </CommitRow>
        )}
      />
    </Column>
  );
}

export function SoloButton() {
  const solo = useGit((state) => state.solo);
  const applying = useGit((state) => state.tab.applyingSolo);
  const { changeSolo: onSolo } = useGitActions();
  return (
    <button
      className={`nav-button toggle ${solo ? 'active' : ''} ${applying ? 'running' : ''}`}
      title={strings.commits.solo}
      aria-pressed={solo}
      disabled={applying}
      onClick={() => onSolo(!solo)}
    >
      <span className="spin-icon">
        <SoloIcon />
      </span>
    </button>
  );
}

export function commitClass(
  hash: string,
  selected: string | undefined,
  headCommit: string | undefined,
): string {
  return [
    'commit',
    ...selectionClasses(hash, selected),
    ...(hash === headCommit ? ['checked-out'] : []),
  ].join(' ');
}

export function CommitRow({
  commit,
  selected,
  indent,
  onSelect,
  onCompare,
  highlight = '',
  itemProps,
  corner,
  children,
}: {
  commit: CommitInfo;
  selected: string | undefined;
  indent: number;
  onSelect: (hash: string) => void;
  onCompare?: (hash: string) => void;
  highlight?: string;
  itemProps?: React.HTMLAttributes<HTMLDivElement>;
  corner?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const openMenu = useOpenMenu();
  const dateFormat = useShell((state) => state.dateFormat);
  const headCommit = useGit((state) => state.tab.repository?.headCommit);
  const stash = useGit((state) => state.stashCommits.has(commit.hash));
  return (
    <div
      {...itemProps}
      className={commitClass(commit.hash, selected, headCommit)}
      style={{ paddingLeft: indent }}
      onClick={(event: Click) =>
        onCompare && isCompareClick(event)
          ? onCompare(commit.hash)
          : onSelect(commit.hash)
      }
      onContextMenu={
        stash
          ? undefined
          : (event) => openMenu(event, commitMenuTarget(commit.hash))
      }
    >
      <div className="commit-line">
        <span className="subject">
          <Highlight text={commit.subject} query={highlight} />
        </span>
        {corner}
      </div>
      <div className="commit-line secondary">
        <span className="author">
          <Highlight text={commit.authorName} query={highlight} />
        </span>
        <span className="date">
          {formatDate(commit.commitDate, dateFormat)}
        </span>
      </div>
      <CommitBubbles hash={commit.hash} />
      {children}
    </div>
  );
}

const ListedCommitRow = memo(CommitRow);
