import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { workingTreeHash, type RefInfo } from '../shared/protocol';
import { DetachedHead, HeadBubble, RefBubble } from './bubbles';
import { Column } from './column';
import { CommitHistory } from './commitHistory';
import { OpenContextMenu } from './contextMenu';
import { GraphCell, graphWidth, rowLanes } from './graph';
import { formatDateTime } from './dates';
import { MenuButton } from './menu';
import { useSkeleton } from './skeleton';
import type { ScrollTarget } from './tabView';

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
  const top = workingTree ? -1 : 0;
  let from: number | undefined;
  if (selected === workingTreeHash) {
    from = -1;
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
  return (
    <div className="bubble-line">
      {detached && <HeadBubble commit={hash} />}
      {refs.map((ref) => (
        <RefBubble key={`${ref.kind}:${ref.name}`} info={ref} />
      ))}
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
}: {
  history: CommitHistory | undefined;
  opening: boolean;
  scrollTarget: ScrollTarget | undefined;
  onScrolled: (hash: string, offset: number) => void;
  onLoad: (start: number, generation: number) => void;
  workingTree: number | undefined;
  refsByCommit: Map<string, RefInfo[]>;
  selected: string | undefined;
  onSelect: (hash: string | undefined, replace?: boolean) => void;
  onToggleMerge: (hash: string) => void;
  collapseMerges: boolean;
  onCollapseMerges: (collapse: boolean) => void;
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

  const scrollIndex = scrollTarget && offset + scrollTarget.index;
  useEffect(() => {
    if (!history || scrollIndex === undefined) {
      return;
    }
    const rowOffset = scrollTarget?.offset;
    if (rowOffset !== undefined) {
      const [start] = virtualizer.getOffsetForIndex(scrollIndex, 'start') ?? [];
      if (start !== undefined) {
        virtualizer.scrollToOffset(start + rowOffset);
      }
      return;
    }
    const onScreen = virtualizer
      .getVirtualItems()
      .some((row) => row.index === scrollIndex);
    virtualizer.scrollToIndex(scrollIndex, {
      align: onScreen ? 'auto' : 'center',
    });
  }, [history, scrollTarget, scrollIndex, virtualizer]);

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
    if (position === -1) {
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
        <div
          style={{ paddingLeft: indent(index) }}
          className={`commit working-tree ${workingTree === 0 ? 'empty' : ''} ${selected === workingTreeHash ? 'selected' : ''}`}
          onClick={() =>
            onSelect(workingTree > 0 ? workingTreeHash : undefined)
          }
        >
          <div className="commit-line">
            <span className="subject">
              {workingTree > 0 ? 'Uncommitted changes' : 'No changes'}
            </span>
            {workingTree > 0 && <span className="count">{workingTree}</span>}
          </div>
          <div className="commit-line secondary">
            <span className="author">
              {workingTree > 0
                ? 'Staged, unstaged and untracked files'
                : 'The working tree is clean'}
            </span>
          </div>
        </div>
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
      title="Commits"
      index={0}
      actions={
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
      }
    >
      <div
        className="list"
        ref={list}
        tabIndex={0}
        onKeyDown={onKeyDown}
        data-version={version}
      >
        <div
          className="list-spacer"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {rows.map((row) => {
            const height = fixedRowHeight(history, offset, row.index, row.size);
            return (
              <div
                key={row.key}
                className="list-row"
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
