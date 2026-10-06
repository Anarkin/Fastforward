import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { comparedOf, shownSide, sidesOf } from '../shared/comparisons';
import {
  workingTreeHash,
  workingTreeIndex,
  type CommitInfo,
  type RefInfo,
  type ScrollTarget,
} from '../shared/protocol';
import { DetachedHead, HeadBubble, RefBubble } from './bubbles';
import { Column } from './column';
import { CommitHistory } from './commitHistory';
import { commitMenuTarget, OpenContextMenu } from './contextMenu';
import { GraphCell, graphWidth, rowLanes } from './graph';
import { formatDateTime } from './dates';
import { MenuButton } from './menu';
import { useSkeleton } from './skeleton';
import { Highlight } from './highlight';
import { clicked, keymap, type Click } from '../shared/keymap';
import { keyPressed } from './shortcuts';
import { strings } from '../shared/strings';
import { columnFocusAttribute } from './activeColumn';
import {
  fullyVisible,
  listMoveOf,
  moveInList,
  type ListMove,
  type VisibleRows,
} from './listMoves';
import { SoloIcon } from './icons';

export const commitRowHeight = 50;
export const workingTreeRowHeight = 30;
export const bubbleLineHeight = 20;
const loadDelay = 80;
const scrolledDelay = 150;
const keyRepeatDelay = 75;

const noHistory = () => () => {};
const noVersion = () => 0;

const openingRows = 20;

export function settling<T>(
  post: (value: T) => void,
  delay = keyRepeatDelay,
): {
  settle: (value: T, repeat: boolean) => void;
  send: (value: T) => void;
  follow: (value: T) => void;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: { value: T; followers: T[] } | undefined;
  const flush = () => {
    clearTimeout(timer);
    const held = pending;
    pending = undefined;
    if (held) {
      post(held.value);
      held.followers.forEach(post);
    }
  };
  return {
    settle: (value, repeat) => {
      clearTimeout(timer);
      pending = undefined;
      if (repeat) {
        pending = { value, followers: [] };
        timer = setTimeout(flush, delay);
      } else {
        post(value);
      }
    },
    send: (value) => {
      flush();
      post(value);
    },
    follow: (value) => {
      if (pending) {
        pending.followers.push(value);
      } else {
        post(value);
      }
    },
  };
}

export function estimatedRowHeight(
  history: CommitHistory | undefined,
  offset: number,
  index: number,
): number {
  if (index < offset) {
    return workingTreeRowHeight;
  }
  return history?.hasBubbles(index - offset)
    ? commitRowHeight + bubbleLineHeight
    : commitRowHeight;
}

export function rowKeyOf(
  history: CommitHistory | undefined,
  offset: number,
  index: number,
): string | number {
  return index < offset
    ? workingTreeHash
    : (history?.at(index - offset)?.hash ?? index);
}

export function fixedRowHeight(
  history: CommitHistory | undefined,
  offset: number,
  index: number,
  estimated: number,
): number | undefined {
  return index < offset || history?.at(index - offset) !== undefined
    ? undefined
    : estimated;
}

export function listTop(
  rows: readonly { index: number; start: number; end: number }[],
  scrollTop: number,
  history: CommitHistory | undefined,
  offset: number,
): { hash: string; offset: number } | undefined {
  if (scrollTop === 0) {
    return { hash: workingTreeHash, offset: 0 };
  }
  const row = rows.find((r) => r.end > scrollTop);
  if (!row) {
    return undefined;
  }
  if (row.index < offset) {
    return { hash: workingTreeHash, offset: 0 };
  }
  const commit = history?.at(row.index - offset);
  return commit && { hash: commit.hash, offset: scrollTop - row.start };
}

function startPosition(
  history: CommitHistory,
  selection: string | undefined,
): number | null | undefined {
  const selected = shownSide(selection);
  if (selected === workingTreeHash) {
    return workingTreeIndex;
  }
  if (selected === undefined) {
    return undefined;
  }
  const hint = history.selectedIndex;
  return (
    history.positionOf(selected) ??
    (hint !== undefined && history.at(hint) === undefined
      ? hint
      : (history.keysFrom ?? null))
  );
}

export function keySelection(
  history: CommitHistory,
  position: number,
  selected: string | undefined,
): string | null | undefined {
  const hash =
    position === workingTreeIndex
      ? workingTreeHash
      : history.at(position)?.hash;
  if (hash === undefined) {
    return null;
  }
  return hash === selected ? undefined : hash;
}

export function mergeToToggle(
  history: CommitHistory,
  selected: string | undefined,
): string | undefined {
  const position =
    selected === undefined ? undefined : history.positionOf(selected);
  return position !== undefined && history.graphAt(position)?.merge
    ? selected
    : undefined;
}

export function pendingSelection(
  pending: { history: CommitHistory; position: number } | undefined,
  history: CommitHistory | undefined,
  selected: string | undefined,
): string | null | undefined {
  return pending && pending.history === history
    ? keySelection(history, pending.position, selected)
    : null;
}

export function listKeyPosition(
  move: ListMove,
  history: CommitHistory,
  selected: string | undefined,
  workingTree: boolean,
  visible: VisibleRows,
  headCommit?: string,
  pending?: number,
): number | undefined {
  const from = pending ?? startPosition(history, selected);
  if (from === null) {
    return undefined;
  }
  const head =
    headCommit === undefined ? undefined : history.positionOf(headCommit);
  if (
    from === undefined &&
    head !== undefined &&
    (move === 'down' || move === 'up')
  ) {
    return head;
  }
  const top = workingTree ? workingTreeIndex : 0;
  const moved = moveInList(
    move,
    from === undefined ? undefined : from - top,
    history.total - top,
    { first: visible.first - top, last: visible.last - top },
  );
  return moved === undefined ? undefined : moved + top;
}

export function workingTreeShift(
  scrollTop: number,
  shiftBy: number,
  rowHeight: number,
): number | undefined {
  return scrollTop === 0 ? undefined : scrollTop + shiftBy * rowHeight;
}

export interface ListScrollState {
  readonly target: ScrollTarget | undefined;
  readonly offset: number;
}

export type ListScroll = { target: ScrollTarget } | { shiftBy: number };

export function listScroll(
  previous: ListScrollState,
  next: ListScrollState,
): ListScroll | undefined {
  if (next.target !== undefined && next.target !== previous.target) {
    return { target: next.target };
  }
  return next.offset === previous.offset
    ? undefined
    : { shiftBy: next.offset - previous.offset };
}

export function keptPlace(
  start: number,
  offset: number,
  scrollTop: number,
  reportedTop: number | undefined,
): { top: number; reportedTop: number } {
  return {
    top:
      start +
      offset +
      (reportedTop === undefined ? 0 : scrollTop - reportedTop),
    reportedTop: start + offset,
  };
}

export function CommitBubbles({
  hash,
  refs,
  detached,
}: {
  hash: string;
  refs: readonly RefInfo[];
  detached: boolean;
}) {
  if (!detached && refs.length === 0) {
    return null;
  }
  const bubbles = [
    ...(detached ? [<HeadBubble key="HEAD" hash={hash} />] : []),
    ...refs.map((ref) => (
      <RefBubble key={`${ref.kind}:${ref.name}`} info={ref} />
    )),
  ];
  return (
    <div className="bubble-line">
      {bubbles.flatMap((bubble, index) =>
        index === 0 ? [bubble] : [<wbr key={`break:${index}`} />, bubble],
      )}
    </div>
  );
}

export function isCompareClick(event: Click): boolean {
  return clicked(keymap.compare, event) !== undefined;
}

function selectionClasses(hash: string, selection: string | undefined) {
  if (!sidesOf(selection).includes(hash)) {
    return [];
  }
  return comparedOf(selection)?.from === hash
    ? ['selected', 'compare-from']
    : ['selected'];
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
  history,
  opening,
  scrollTarget,
  onScrolled,
  onLoad,
  workingTree,
  refsByCommit,
  selected,
  onSelect,
  onCompare,
  onToggleMerge,
  collapseMerges,
  onCollapseMerges,
  solo,
  headCommit,
  applyingSolo,
  onSolo,
  navigation,
  search,
  focusKey,
  error,
}: {
  history: CommitHistory | undefined;
  opening: boolean;
  scrollTarget: ScrollTarget | undefined;
  onScrolled: (hash: string, offset: number) => void;
  onLoad: (start: number, generation: number) => void;
  workingTree: number | undefined;
  refsByCommit: ReadonlyMap<string, readonly RefInfo[]>;
  selected: string | undefined;
  onSelect: (
    hash: string | undefined,
    replace?: boolean,
    repeat?: boolean,
  ) => void;
  onCompare: (hash: string) => void;
  onToggleMerge: (hash: string) => void;
  collapseMerges: boolean;
  onCollapseMerges: (collapse: boolean) => void;
  solo: boolean;
  headCommit: string | undefined;
  applyingSolo: boolean;
  onSolo: (solo: boolean) => void;
  navigation?: React.ReactNode;
  search?: React.ReactNode;
  focusKey?: string;
  error?: string;
}) {
  const version = useSyncExternalStore(
    history?.subscribe ?? noHistory,
    history?.getVersion ?? noVersion,
  );
  const list = useRef<HTMLDivElement>(null);
  const detached = useContext(DetachedHead);
  const hasWorkingTree = workingTree !== undefined;
  const offset = hasWorkingTree ? 1 : 0;
  const skeleton = useSkeleton(opening);
  const count = offset + (history?.total ?? (skeleton ? openingRows : 0));

  const rowHeight = useCallback(
    (index: number) => estimatedRowHeight(history, offset, index),
    [history, offset],
  );
  const rowKey = useCallback(
    (index: number) => rowKeyOf(history, offset, index),
    [history, offset],
  );
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => list.current,
    estimateSize: rowHeight,
    getItemKey: rowKey,
    overscan: 10,
  });
  const rows = virtualizer.getVirtualItems();
  const first = Math.max(0, (rows[0]?.index ?? 0) - offset);
  const last = Math.max(0, (rows.at(-1)?.index ?? 0) - offset);

  useEffect(() => {
    if (!history) {
      return undefined;
    }
    const timer = setTimeout(() => {
      for (const start of history.takeMissingPages(first, last)) {
        onLoad(start, history.generation);
      }
    }, loadDelay);
    return () => clearTimeout(timer);
  }, [history, first, last, onLoad]);

  const shown = useRef<ListScrollState>({ target: undefined, offset });
  const reportedTop = useRef<number>(undefined);
  useEffect(() => {
    if (!history) {
      reportedTop.current = undefined;
    }
  }, [history]);
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
      const shifted = workingTreeShift(
        element.scrollTop,
        action.shiftBy,
        workingTreeRowHeight,
      );
      if (shifted !== undefined) {
        virtualizer.scrollToOffset(shifted);
      }
      return;
    }
    const index = offset + action.target.index;
    if (action.target.offset !== undefined) {
      const [start] = virtualizer.getOffsetForIndex(index, 'start') ?? [];
      if (start !== undefined) {
        const place = keptPlace(
          start,
          action.target.offset,
          list.current?.scrollTop ?? 0,
          reportedTop.current,
        );
        reportedTop.current = place.reportedTop;
        virtualizer.scrollToOffset(place.top);
      }
      return;
    }
    const onScreen = virtualizer
      .getVirtualItems()
      .some((row) => row.index === index);
    virtualizer.scrollToIndex(index, { align: onScreen ? 'auto' : 'center' });
  }, [history, scrollTarget, offset, virtualizer]);

  const topUnreported = useRef(false);
  const reportTop = useCallback(() => {
    const element = list.current;
    if (!element) {
      return;
    }
    const top = listTop(
      virtualizer.getVirtualItems(),
      element.scrollTop,
      history,
      offset,
    );
    topUnreported.current = top === undefined;
    if (top) {
      reportedTop.current = element.scrollTop;
      onScrolled(top.hash, top.offset);
    }
  }, [history, offset, onScrolled, virtualizer]);
  useEffect(() => {
    const element = list.current;
    if (!element) {
      return undefined;
    }
    topUnreported.current = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(reportTop, scrolledDelay);
    };
    element.addEventListener('scroll', onScroll);
    return () => {
      clearTimeout(timer);
      element.removeEventListener('scroll', onScroll);
    };
  }, [reportTop]);
  useEffect(() => {
    if (topUnreported.current) {
      reportTop();
    }
  }, [version, reportTop]);

  const pending = useRef<{ history: CommitHistory; position: number }>(
    undefined,
  );
  useEffect(() => {
    pending.current = undefined;
  }, [selected, history]);
  useEffect(() => {
    const hash = pendingSelection(pending.current, history, selected);
    if (hash !== null) {
      pending.current = undefined;
      if (hash !== undefined) {
        onSelect(hash, true);
      }
    }
  });
  useEffect(() => {
    if (focusKey !== undefined) {
      list.current?.focus({ preventScroll: true });
    }
  }, [focusKey]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (keyPressed(keymap.merge, event)) {
      event.preventDefault();
      const merge = history && mergeToToggle(history, selected);
      if (merge !== undefined) {
        onToggleMerge(merge);
      }
      return;
    }
    const move = listMoveOf(event);
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
        element?.scrollTop ?? 0,
        element?.clientHeight ?? 0,
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
    pending.current = hash === null ? { history, position } : undefined;
    if (hash) {
      onSelect(hash, true, event.repeat);
    }
    virtualizer.scrollToIndex(offset + position, { align: 'auto' });
  };

  const graphOf = (index: number) =>
    hasWorkingTree && index === 0
      ? history?.workingTreeGraph
      : history?.graphAt(index - offset);

  const renderGraph = (index: number, height: number) => {
    const graphRow = graphOf(index);
    return (
      graphRow && (
        <GraphCell
          row={graphRow}
          height={height}
          onToggleMerge={() => {
            const commit = history?.at(index - offset);
            if (commit) {
              onToggleMerge(commit.hash);
            }
          }}
        />
      )
    );
  };

  const indent = (index: number) => graphWidth(rowLanes(graphOf(index))) + 8;

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
      <CommitRow
        commit={commit}
        selected={selected}
        headCommit={headCommit}
        refs={refsByCommit.get(commit.hash) ?? []}
        detached={detached === commit.hash}
        indent={indent(index)}
        onSelect={onSelect}
        onCompare={onCompare}
      />
    );
  };

  return (
    <Column
      title={search}
      index={0}
      start={navigation}
      actions={
        <>
          <SoloButton solo={solo} applying={applyingSolo} onSolo={onSolo} />
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
      {error && <div className="error-message">{error}</div>}
      <div
        className="virtual-rows list"
        ref={list}
        tabIndex={0}
        {...{ [columnFocusAttribute]: '' }}
        onKeyDown={onKeyDown}
      >
        <div
          className="virtual-spacer"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {rows.map((row) => {
            const height = fixedRowHeight(history, offset, row.index, row.size);
            return (
              <div
                key={row.key}
                className="virtual-row"
                data-index={row.index}
                ref={
                  height === undefined ? virtualizer.measureElement : undefined
                }
                style={{
                  height,
                  transform: `translateY(${row.start}px)`,
                }}
              >
                {renderGraph(row.index, row.size)}
                {renderRow(row.index)}
              </div>
            );
          })}
        </div>
      </div>
    </Column>
  );
}

export function SoloButton({
  solo,
  applying,
  onSolo,
}: {
  solo: boolean;
  applying: boolean;
  onSolo: (solo: boolean) => void;
}) {
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
  headCommit,
  refs,
  detached,
  indent,
  onSelect,
  onCompare,
  highlight = '',
}: {
  commit: CommitInfo;
  selected: string | undefined;
  headCommit: string | undefined;
  refs: readonly RefInfo[];
  detached: boolean;
  indent: number;
  onSelect: (hash: string) => void;
  onCompare?: (hash: string) => void;
  highlight?: string;
}) {
  const openMenu = useContext(OpenContextMenu);
  return (
    <div
      className={commitClass(commit.hash, selected, headCommit)}
      style={{ paddingLeft: indent }}
      onClick={(event: Click) =>
        onCompare && isCompareClick(event)
          ? onCompare(commit.hash)
          : onSelect(commit.hash)
      }
      onContextMenu={(event) => openMenu(event, commitMenuTarget(commit.hash))}
    >
      <div className="commit-line">
        <span className="subject">
          <Highlight text={commit.subject} query={highlight} />
        </span>
      </div>
      <div className="commit-line secondary">
        <span className="author">
          <Highlight text={commit.authorName} query={highlight} />
        </span>
        <span className="date">{formatDateTime(commit.commitDate)}</span>
      </div>
      <CommitBubbles hash={commit.hash} refs={refs} detached={detached} />
    </div>
  );
}
