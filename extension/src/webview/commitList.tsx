import {
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useSyncExternalStore,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  workingTreeHash,
  workingTreeIndex,
  workingTreeSubject,
  type RefInfo,
  type ScrollTarget,
} from '../shared/protocol';
import { commitBubbles, DetachedHead } from './bubbles';
import { Column } from './column';
import { CommitHistory } from './commitHistory';
import { OpenContextMenu } from './contextMenu';
import { GraphCell, graphWidth, rowLanes } from './graph';
import { formatDateTime } from './dates';
import { MenuButton } from './menu';
import { useSkeleton } from './skeleton';
import { SoloIcon } from './icons';

export const commitRowHeight = 50;
export const bubbleLineHeight = 20;
const loadDelay = 80;
const scrolledDelay = 150;

const noHistory = () => () => {};
const noVersion = () => 0;

const openingRows = 20;

export function estimatedRowHeight(
  history: CommitHistory | undefined,
  offset: number,
  index: number,
): number {
  return index >= offset && (history?.refCountAt(index - offset) ?? 0) > 0
    ? commitRowHeight + bubbleLineHeight
    : commitRowHeight;
}

export function rowKeyOf(
  history: CommitHistory | undefined,
  offset: number,
  index: number,
): string {
  return index < offset
    ? workingTreeHash
    : (history?.at(index - offset)?.hash ?? `position ${index}`);
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

export function arrowKeyPosition(
  history: CommitHistory,
  selected: string | undefined,
  workingTree: boolean,
  step: number,
): number | undefined {
  const top = workingTree ? workingTreeIndex : 0;
  let from: number | undefined;
  if (selected === workingTreeHash) {
    from = workingTreeIndex;
  } else if (selected !== undefined) {
    const hint = history.selectedIndex;
    from =
      history.positionOf(selected) ??
      (hint !== undefined && history.at(hint) === undefined ? hint : undefined);
    if (from === undefined) {
      return undefined;
    }
  }
  const position = Math.max(
    top,
    Math.min(history.total - 1, (from ?? top - 1) + step),
  );
  return position === from ? undefined : position;
}

export function workingTreeShift(
  scrollTop: number,
  previousOffset: number,
  offset: number,
  rowHeight: number,
): number | undefined {
  return offset === previousOffset || scrollTop === 0
    ? undefined
    : scrollTop + (offset - previousOffset) * rowHeight;
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
  const bubbles = commitBubbles(hash, refs, detached);
  if (bubbles.length === 0) {
    return null;
  }
  return (
    <div className="bubble-line">
      {bubbles.map((bubble) => (
        <Fragment key={bubble.key}>{bubble.element}</Fragment>
      ))}
    </div>
  );
}

export function WorkingTreeRow({
  count,
  selected,
  indent,
  onSelect,
}: {
  count: number;
  selected: boolean;
  indent: number;
  onSelect: (hash: string | undefined) => void;
}) {
  const dirty = count > 0;
  return (
    <div
      style={{ paddingLeft: indent }}
      className={`commit working-tree ${dirty ? '' : 'empty'} ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(dirty ? workingTreeHash : undefined)}
    >
      <div className="commit-line">
        <span className="subject">
          {dirty ? workingTreeSubject : 'No changes'}
        </span>
        {dirty && <span className="count">{count}</span>}
      </div>
      <div className="commit-line secondary">
        <span className="author">
          {dirty
            ? 'Staged, unstaged and untracked files'
            : 'The working tree is clean'}
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
  onToggleMerge,
  collapseMerges,
  onCollapseMerges,
  solo,
  onSolo,
  navigation,
  search,
}: {
  history: CommitHistory | undefined;
  opening: boolean;
  scrollTarget: ScrollTarget | undefined;
  onScrolled: (hash: string, offset: number) => void;
  onLoad: (start: number, generation: number) => void;
  workingTree: number | undefined;
  refsByCommit: ReadonlyMap<string, readonly RefInfo[]>;
  selected: string | undefined;
  onSelect: (hash: string | undefined, replace?: boolean) => void;
  onToggleMerge: (hash: string) => void;
  collapseMerges: boolean;
  onCollapseMerges: (collapse: boolean) => void;
  solo: boolean;
  onSolo: (solo: boolean) => void;
  navigation?: React.ReactNode;
  search?: React.ReactNode;
}) {
  const version = useSyncExternalStore(
    history?.subscribe ?? noHistory,
    history?.getVersion ?? noVersion,
  );
  const list = useRef<HTMLDivElement>(null);
  const openMenu = useContext(OpenContextMenu);
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

  const shownOffset = useRef(offset);
  const applyTarget = useEffectEvent((target: ScrollTarget) => {
    shownOffset.current = offset;
    const index = offset + target.index;
    if (target.offset !== undefined) {
      const [start] = virtualizer.getOffsetForIndex(index, 'start') ?? [];
      if (start !== undefined) {
        virtualizer.scrollToOffset(start + target.offset);
      }
      return;
    }
    const onScreen = virtualizer
      .getVirtualItems()
      .some((row) => row.index === index);
    virtualizer.scrollToIndex(index, { align: onScreen ? 'auto' : 'center' });
  });
  useEffect(() => {
    if (history && scrollTarget) {
      applyTarget(scrollTarget);
    }
  }, [history, scrollTarget]);
  useEffect(() => {
    const previous = shownOffset.current;
    shownOffset.current = offset;
    const element = list.current;
    if (!element) {
      return;
    }
    const shifted = workingTreeShift(
      element.scrollTop,
      previous,
      offset,
      commitRowHeight,
    );
    if (shifted !== undefined) {
      virtualizer.scrollToOffset(shifted);
    }
  }, [offset, virtualizer]);

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

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step =
      event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!step || !history) {
      return;
    }
    event.preventDefault();
    const position = arrowKeyPosition(history, selected, !!workingTree, step);
    if (position === undefined) {
      return;
    }
    if (position === workingTreeIndex) {
      onSelect(workingTreeHash, true);
    } else {
      const commit = history.at(position);
      if (commit) {
        onSelect(commit.hash, true);
      }
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
          selected={selected === workingTreeHash}
          indent={indent(index)}
          onSelect={onSelect}
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
      <div
        className={`commit ${commit.hash === selected ? 'selected' : ''}`}
        style={{ paddingLeft: indent(index) }}
        onClick={() => onSelect(commit.hash)}
        onContextMenu={(event) =>
          openMenu(event, { kind: 'commit', hash: commit.hash })
        }
      >
        <div className="commit-line">
          <span className="subject">{commit.subject}</span>
          {commit.files > 0 && <span className="count">{commit.files}</span>}
        </div>
        <div className="commit-line secondary">
          <span className="author">{commit.authorName}</span>
          <span className="date">{formatDateTime(commit.authorDate)}</span>
        </div>
        <CommitBubbles
          hash={commit.hash}
          refs={refsByCommit.get(commit.hash) ?? []}
          detached={detached === commit.hash}
        />
      </div>
    );
  };

  return (
    <Column
      title={search}
      index={0}
      start={navigation}
      actions={
        <>
          <button
            className={`nav-button toggle ${solo ? 'active' : ''}`}
            title="Solo: show only the history of the checked-out commit"
            aria-pressed={solo}
            onClick={() => onSolo(!solo)}
          >
            <SoloIcon />
          </button>
          <MenuButton
            title="Commit list settings"
            items={[
              {
                label: 'Collapse merge commits',
                checked: collapseMerges,
                onClick: () => onCollapseMerges(!collapseMerges),
              },
            ]}
          />
        </>
      }
    >
      <div
        className="virtual-rows list"
        ref={list}
        tabIndex={0}
        onKeyDown={onKeyDown}
        data-version={version}
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
