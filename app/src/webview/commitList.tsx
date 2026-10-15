import {
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import {
  useVirtualizer,
  type VirtualItem,
  type Virtualizer,
  type VirtualizerOptions,
} from '@tanstack/react-virtual';
import { comparedOf, shownSide, sidesOf } from '../shared/comparisons';
import {
  workingTreeHash,
  workingTreeIndex,
  type CommitInfo,
  type GraphRow,
  type RefInfo,
  type ScrollTarget,
} from '../shared/protocol';
import { DetachedHead, HeadBubble, RefBubble, StashBubble } from './bubbles';
import { Column } from './column';
import { CommitHistory } from './commitHistory';
import {
  commitMenuTarget,
  OpenContextMenu,
  type MenuTarget,
} from './contextMenu';
import { GraphCell, graphWidth, rowLanes } from './graph';
import { formatDateTime } from './dates';
import { MenuButton } from './menu';
import { useSkeleton } from './skeleton';
import { Highlight } from './highlight';
import {
  clicked,
  keymap,
  menuFromKeyboard,
  type Click,
} from '../shared/keymap';
import { keyPressed } from './shortcuts';
import { withoutRemote } from '../shared/refNames';
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
import { useCappedScroll } from './cappedVirtualizer';
import { realHeight } from './cappedScroll';
import { rowPlace } from './rowPlace';
import { activeDescendant, rowId } from './virtualRows';

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
  pass: (value: T) => void;
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
    pass: post,
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

function remeasureRowsLaidOutBeforeTheirCommitLoaded(
  rows: readonly VirtualItem[],
  heights: Virtualizer<Element, Element>['itemSizeCache'],
  keyOf: (index: number) => VirtualItem['key'],
): void {
  for (const row of rows) {
    const key = keyOf(row.index);
    if (row.key !== key) {
      heights.delete(key);
    }
  }
}

export function drawnRows(
  virtualizer: Pick<
    Virtualizer<Element, Element>,
    'getVirtualItems' | 'itemSizeCache'
  >,
  keyOf: (index: number) => VirtualItem['key'],
): VirtualItem[] {
  const rows = virtualizer.getVirtualItems();
  remeasureRowsLaidOutBeforeTheirCommitLoaded(
    rows,
    virtualizer.itemSizeCache,
    keyOf,
  );
  return rows.map((row) => {
    const key = keyOf(row.index);
    return key === row.key ? row : { ...row, key };
  });
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
    return { hash: workingTreeHash, offset: scrollTop - row.start };
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

export function keyboardMenuTarget(
  selected: string | undefined,
  stashes: ReadonlySet<string>,
): MenuTarget | undefined {
  const hash = shownSide(selected);
  return hash === undefined || hash === workingTreeHash || stashes.has(hash)
    ? undefined
    : commitMenuTarget(hash);
}

export function withoutWorkingTreeLink(
  row: GraphRow,
  position: number,
  headPosition: number | undefined,
): GraphRow {
  if (headPosition !== undefined && position > headPosition) {
    return row;
  }
  return {
    ...row,
    lines: row.lines.filter((line) => !(line.dashed && line.from === 0)),
  };
}

interface PendingKey {
  readonly history: CommitHistory;
  readonly position: number;
  readonly repeat: boolean;
}

export function pendingSelection(
  pending: PendingKey | undefined,
  history: CommitHistory | undefined,
  selected: string | undefined,
): { readonly hash: string; readonly repeat: boolean } | null | undefined {
  if (!pending || pending.history !== history) {
    return null;
  }
  const hash = keySelection(history, pending.position, selected);
  return hash === null || hash === undefined
    ? hash
    : { hash, repeat: pending.repeat };
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
): number {
  return (
    start + offset + (reportedTop === undefined ? 0 : scrollTop - reportedTop)
  );
}

let reports = 0;

export class ReportedPlaces {
  private readonly tops = new Map<number, number>();

  told(top: number): number {
    reports += 1;
    this.tops.set(reports, top);
    return reports;
  }

  kept(
    start: number,
    offset: number,
    scrollTop: number,
    report: number | undefined,
  ): number {
    const top = keptPlace(
      start,
      offset,
      scrollTop,
      report === undefined ? undefined : this.tops.get(report),
    );
    if (report !== undefined && this.tops.has(report)) {
      const moved = top - scrollTop;
      for (const [told, at] of this.tops) {
        if (told < report) {
          this.tops.delete(told);
        } else {
          this.tops.set(told, at + moved);
        }
      }
    }
    return top;
  }

  moved(by: number): void {
    for (const [told, at] of this.tops) {
      this.tops.set(told, at + by);
    }
  }

  forget(): void {
    this.tops.clear();
  }
}

export function movingPlaces<T extends Element>(
  places: ReportedPlaces,
  scrollToFn: VirtualizerOptions<T, Element>['scrollToFn'],
): VirtualizerOptions<T, Element>['scrollToFn'] {
  return (offset, options, instance) => {
    places.moved(options.adjustments ?? 0);
    scrollToFn(offset, options, instance);
  };
}

export function trailing(
  run: () => void,
  delay: number,
): { schedule: () => void; flush: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
      run();
    }
  };
  return {
    schedule: () => {
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    flush,
  };
}

export function useScrollReports(
  list: RefObject<HTMLElement | null>,
  topNow: () => (() => boolean) | undefined,
): () => void {
  const topUnreported = useRef(false);
  useLayoutEffect(() => {
    const element = list.current;
    if (!element) {
      return undefined;
    }
    topUnreported.current = false;
    let reportTop = () => true;
    const report = trailing(() => {
      topUnreported.current = !reportTop();
    }, scrolledDelay);
    const scrolled = () => {
      const top = topNow();
      if (top) {
        reportTop = top;
        report.schedule();
      }
    };
    element.addEventListener('scroll', scrolled);
    return () => {
      report.flush();
      element.removeEventListener('scroll', scrolled);
    };
  }, [list, topNow]);
  return useCallback(() => {
    const reportTop = topUnreported.current ? topNow() : undefined;
    if (reportTop) {
      topUnreported.current = !reportTop();
    }
  }, [topNow]);
}

export function atMostEvery(
  run: () => void,
  delay: number,
): { schedule: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let again = false;
  const cool = () => {
    timer = setTimeout(() => {
      timer = undefined;
      if (again) {
        again = false;
        run();
        cool();
      }
    }, delay);
  };
  return {
    schedule: () => {
      if (timer === undefined) {
        run();
        cool();
      } else {
        again = true;
      }
    },
    cancel: () => {
      clearTimeout(timer);
      timer = undefined;
      again = false;
    },
  };
}

export function CommitBubbles({
  hash,
  refs,
  stash = false,
  detached,
}: {
  hash: string;
  refs: readonly RefInfo[];
  stash?: boolean;
  detached: boolean;
}) {
  if (!detached && refs.length === 0 && !stash) {
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
    ...(stash ? [<StashBubble key="stash" />] : []),
  ];
  return (
    <div className="bubble-line">
      {bubbles.flatMap((bubble, index) =>
        index === 0 ? [bubble] : [<wbr key={`break:${index}`} />, bubble],
      )}
    </div>
  );
}

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
  history,
  opening,
  scrollTarget,
  onScrolled,
  onLoad,
  workingTree,
  refsByCommit,
  stashes,
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
  searchButton,
  focusKey,
  searching = false,
  error,
}: {
  history: CommitHistory | undefined;
  opening: boolean;
  scrollTarget: ScrollTarget | undefined;
  onScrolled: (hash: string, offset: number, report: number) => void;
  onLoad: (start: number, count: number, generation: number) => void;
  workingTree: number | undefined;
  refsByCommit: ReadonlyMap<string, readonly RefInfo[]>;
  stashes: ReadonlySet<string>;
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
  searchButton?: React.ReactNode;
  focusKey?: string;
  searching?: boolean;
  error?: string;
}) {
  const version = useSyncExternalStore(
    history?.subscribe ?? noHistory,
    history?.getVersion ?? noVersion,
  );
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  const detached = useContext(DetachedHead);
  const hasWorkingTree = workingTree !== undefined;
  const openMenu = useContext(OpenContextMenu);
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
  const { scrolling, shift, scrollTop, resized } =
    useCappedScroll<HTMLDivElement>();
  const [places] = useState(() => new ReportedPlaces());
  const [scrollToFn] = useState(() =>
    movingPlaces(places, scrolling.scrollToFn),
  );
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => list.current,
    estimateSize: rowHeight,
    getItemKey: rowKey,
    overscan: 10,
    ...scrolling,
    scrollToFn,
  });
  const totalSize = virtualizer.getTotalSize();
  useLayoutEffect(resized, [resized, totalSize]);
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
  useEffect(() => {
    if (!history) {
      places.forget();
    }
  }, [history, places]);
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
      const shifted = workingTreeShift(
        top,
        action.shiftBy,
        workingTreeRowHeight,
      );
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
          ),
        );
      }
      return;
    }
    const onScreen = virtualizer
      .getVirtualItems()
      .some((row) => row.index === index);
    virtualizer.scrollToIndex(index, { align: onScreen ? 'auto' : 'center' });
  }, [history, scrollTarget, offset, virtualizer, scrollTop, places]);

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
        scrollTop(element),
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
        stash={stashes.has(commit.hash)}
        detached={detached === commit.hash}
        indent={indent(index)}
        onSelect={onSelect}
        onCompare={onCompare}
      />
    );
  };

  return (
    <Column
      overlay={search}
      search={searchButton}
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
  stash,
  detached,
  indent,
  onSelect,
  onCompare,
  highlight = '',
  itemProps,
}: {
  commit: CommitInfo;
  selected: string | undefined;
  headCommit: string | undefined;
  refs: readonly RefInfo[];
  stash?: boolean;
  detached: boolean;
  indent: number;
  onSelect: (hash: string) => void;
  onCompare?: (hash: string) => void;
  highlight?: string;
  itemProps?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const openMenu = useContext(OpenContextMenu);
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
      </div>
      <div className="commit-line secondary">
        <span className="author">
          <Highlight text={commit.authorName} query={highlight} />
        </span>
        <span className="date">{formatDateTime(commit.commitDate)}</span>
      </div>
      <CommitBubbles
        hash={commit.hash}
        refs={refs}
        stash={stash}
        detached={detached}
      />
    </div>
  );
}
