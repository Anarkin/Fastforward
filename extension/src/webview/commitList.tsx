import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { workingTreeHash, type RefInfo } from '../protocol';
import { DetachedHead, HeadBubble, RefBubble } from './bubbles';
import { Column } from './column';
import { CommitHistory } from './commitHistory';
import { OpenContextMenu } from './contextMenu';
import { GraphCell, graphWidth, rowLanes } from './graph';
import { formatDateTime } from './dates';
import { MenuButton } from './menu';
import { useSkeleton } from './skeleton';
import type { ScrollTarget } from './tabView';

// A row is this high, plus a line per ref pointing at its commit; the ref
// counts arrive with the history, so every row's height, and so the scroll
// position of every commit, is known without loading or measuring it
export const commitRowHeight = 50;
export const bubbleLineHeight = 20;
// Pages are asked for once scrolling pauses this long, so dragging the
// scrollbar across years doesn't load every page in between
export const loadDelay = 80;

// Only the rows on screen are rendered, and the list has the height of the
// whole history from the start, so the scrollbar never changes
const noHistory = () => () => {};
const noVersion = () => 0;

// Enough placeholder rows to fill the list while a tab opens
const openingRows = 20;

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
  // The tab's history hasn't arrived yet
  opening: boolean;
  scrollTarget: ScrollTarget | undefined;
  // The commit at the top of the list once scrolling stops
  onScrolled: (hash: string, offset: number) => void;
  onLoad: (start: number) => void;
  workingTree: number | undefined;
  refsByCommit: Map<string, RefInfo[]>;
  selected: string | undefined;
  // Replace is set for the arrow keys, which add no step to the history
  onSelect: (
    hash: string | undefined,
    index: number,
    replace?: boolean,
  ) => void;
  onToggleMerge: (hash: string) => void;
  collapseMerges: boolean;
  onCollapseMerges: (collapse: boolean) => void;
}) {
  // Changes when pages arrive, as the history is filled in place
  const version = useSyncExternalStore(
    history?.subscribe ?? noHistory,
    history?.getVersion ?? noVersion,
  );
  const list = useRef<HTMLDivElement>(null);
  const openMenu = useContext(OpenContextMenu);
  const detached = useContext(DetachedHead);
  const hasWorkingTree = workingTree !== undefined;
  const offset = hasWorkingTree ? 1 : 0;
  // A tab that is opening shows placeholder rows until its history arrives
  const skeleton = useSkeleton(opening);
  const count = offset + (history?.total ?? (skeleton ? openingRows : 0));

  const rowHeight = useCallback(
    (index: number) =>
      index < offset
        ? commitRowHeight
        : commitRowHeight +
          (history?.refCountAt(index - offset) ?? 0) * bubbleLineHeight,
    [history, offset],
  );
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => list.current,
    estimateSize: rowHeight,
    overscan: 10,
  });
  // The virtualizer keeps the heights it computed; a new history has new ones
  useEffect(() => virtualizer.measure(), [virtualizer, rowHeight]);
  const rows = virtualizer.getVirtualItems();
  const first = Math.max(0, (rows[0]?.index ?? 0) - offset);
  const last = Math.max(0, (rows.at(-1)?.index ?? 0) - offset);

  useEffect(() => {
    if (!history) {
      return undefined;
    }
    const timer = setTimeout(() => {
      for (const start of history.takeMissingPages(first, last)) {
        onLoad(start);
      }
    }, loadDelay);
    return () => clearTimeout(timer);
  }, [history, first, last, onLoad]);

  // Scrolls to the selected commit or a location's commit, which may be years
  // back; a commit that is already on screen stays where it is
  const scrollIndex = scrollTarget && offset + scrollTarget.index;
  useEffect(() => {
    if (!history || scrollIndex === undefined) {
      return;
    }
    // A reload puts the commit that was at the top back at the top
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
    // scrollTarget is new for every jump, even to the same commit
  }, [history, scrollTarget, scrollIndex, virtualizer]);

  // Tells the extension which commit is at the top once scrolling stops, so a
  // reload can keep it there; all the way up counts as the top of the list,
  // which a reload keeps, with its new commits
  useEffect(() => {
    const element = list.current;
    if (!element) {
      return undefined;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const top = element.scrollTop;
        if (top === 0) {
          onScrolled(workingTreeHash, 0);
          return;
        }
        const row = virtualizer.getVirtualItems().find((r) => r.end > top);
        const commit = row && history?.at(row.index - offset);
        if (row && commit) {
          onScrolled(commit.hash, top - row.start);
        } else if (row && row.index < offset) {
          // Within the working tree's row, which is above every commit
          onScrolled(workingTreeHash, 0);
        }
      }, 150);
    };
    element.addEventListener('scroll', onScroll);
    return () => {
      clearTimeout(timer);
      element.removeEventListener('scroll', onScroll);
    };
  }, [history, offset, onScrolled, virtualizer]);

  const selectedPosition =
    selected === workingTreeHash
      ? -1
      : selected === undefined
        ? undefined
        : history?.positionOf(selected);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step =
      event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!step || !history) {
      return;
    }
    event.preventDefault();
    const top = workingTree ? -1 : 0;
    const position = Math.max(
      top,
      Math.min(history.total - 1, (selectedPosition ?? top - 1) + step),
    );
    // At either end, where selecting again would clear the selection
    if (position === selectedPosition) {
      return;
    }
    if (position === -1) {
      onSelect(workingTreeHash, -1, true);
    } else {
      // Rows that haven't loaded yet can't be selected
      const commit = history.at(position);
      if (!commit) {
        return;
      }
      onSelect(commit.hash, position, true);
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

  // Each row's text starts right after the lanes it draws in
  const indent = (index: number) => graphWidth(rowLanes(graphOf(index))) + 8;

  const renderRow = (index: number) => {
    if (hasWorkingTree && index === 0) {
      return (
        <div
          style={{ paddingLeft: indent(index) }}
          className={`commit working-tree ${workingTree === 0 ? 'empty' : ''} ${selected === workingTreeHash ? 'selected' : ''}`}
          onClick={() =>
            onSelect(workingTree > 0 ? workingTreeHash : undefined, -1)
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
        onClick={() => onSelect(commit.hash, position)}
        // No items yet; bubbles in the row open their own menu first
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
        {detached === commit.hash && (
          <div className="bubble-line">
            <HeadBubble commit={commit.hash} />
          </div>
        )}
        {(refsByCommit.get(commit.hash) ?? []).map((ref) => (
          <div key={`${ref.kind}:${ref.name}`} className="bubble-line">
            <RefBubble info={ref} />
          </div>
        ))}
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
          {rows.map((row) => (
            <div
              key={row.key}
              className="list-row"
              style={{
                height: row.size,
                transform: `translateY(${row.start}px)`,
              }}
            >
              {renderGraph(row.index, row.size)}
              {renderRow(row.index)}
            </div>
          ))}
        </div>
      </div>
    </Column>
  );
}
