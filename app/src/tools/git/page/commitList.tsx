import { CollapseMergesButton } from './collapseMergesButton';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { sidesOf } from '../../../lib/shared/comparisons';
import { workingTreeHash } from '../shared/protocol';
import { Column } from '../../../lib/page/column';
import { ColumnResizer } from './columnResizer';
import { useOpenMenu } from './menus';
import { rowLanes, withoutWorkingTreeLink } from './graphLanes';
import { useCommitPointer } from './commitPointer';
import type { RowHit } from './commitHits';
import { CommitCanvas } from './commitCanvas';
import {
  keptLooksOf,
  lookIn,
  type KeptLooks,
  type RowLook,
} from './commitLooks';
import { BubbleShapes } from './bubbleShapes';
import {
  looksOn,
  shapeKey,
  type ActionKey,
  type BubbleLook,
} from './bubbleLooks';
import {
  layoutSelectionOf,
  openingOf,
  searchingOf,
  tabScopeOf,
} from './selectors';
import { useGit, useGitActions } from './store';
import { listError } from './columnsShown';
import { MessagePeek } from './messagePeek';
import { MessageBody } from './messagePanel';
import { useSkeleton } from '../../../lib/page/skeletonDelay';
import { menuFromKeyboard } from '../../../lib/shared/keymap';
import { gitKeymap } from './keymap';
import { keyPressed } from '../../../lib/page/shortcuts';
import { strings } from '../../../lib/shared/strings';
import { Words } from '../../../lib/page/name';
import { columnFocusAttribute } from '../../../lib/page/columnFocus';
import { fullyVisible } from '../../../lib/page/listMoves';
import { useCappedScroll } from './cappedVirtualizer';
import { SearchButton } from './searchButton';
import { realHeight, scrollCap } from './cappedScroll';
import { endPaddingToStart, snappedToStart } from '../../../lib/page/rowStarts';
import { followRows, type RowFollower } from '../../../lib/page/rowScroll';
import { useShell } from '../../../shell/page/store';
import { watchDevicePixels } from '../../../lib/page/devicePixels';
import { endCovered, rowRoom } from '../../../lib/page/listRows';
import {
  ReportedPlaces,
  movingPlaces,
  useListPlace,
} from './commitListScrolling';
import { atMostEvery } from './commitPages';
import { onceQuiet } from './quietRun';
import {
  keySelection,
  mergeToToggle,
  keyboardMenuTarget,
  PendingKey,
  pendingSelection,
  listKeyPosition,
  commitMoveOf,
} from './commitListKeys';
import {
  useRowLineHeight,
  rowSizes,
  rowKeyOf,
  drawnRows,
  crowdedResize,
} from './commitListRows';
import { selectionClasses } from './commitListItems';
import { formatDate } from '../../../lib/page/dates';
import { BubbleLab } from './bubbleLab';
import { indentOf, rowIndent } from './bubbleLines';
import { useCommitSurroundings, useCrowdedBubbles } from './crowdedBubbles';
import { CommitRow } from './commitRow';
import { SoloButton } from './soloButton';
import { ColumnStatus } from '../../../lib/page/columnStatusLine';
import { commitsCounted } from './columnStatus';

const loadDelay = 80;

const bubblesRest = 150;

const noHistory = () => () => {};

const noVersion = () => 0;

const noSelect = () => {};

const openingRows = 20;

function keptIn(
  kept: { current: KeptLooks | undefined },
  parts: readonly unknown[],
): KeptLooks {
  kept.current = keptLooksOf(kept.current, parts);
  return kept.current;
}

function bubbleShapesOf(
  looks: readonly (RowLook | undefined)[],
): Map<string, BubbleLook> {
  const shapes = new Map<string, BubbleLook>();
  for (const look of looks) {
    if (look?.kind === 'commit') {
      for (const { look: bubble } of look.bubbles) {
        const key = shapeKey(bubble);
        if (!shapes.has(key)) {
          shapes.set(key, { ...bubble, text: '' });
        }
      }
    }
  }
  return shapes;
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
  const headCommit = useGit((state) => state.tab.repository?.headCommit);
  const searching = useGit(searchingOf);
  const error = useGit((state) =>
    listError(state.tab.error, layoutSelectionOf(state)),
  );
  const {
    selectCommit: onSelect,
    toggleMerge: onToggleMerge,
    scrolled: reportScrolled,
    loadCommits: onLoad,
    search: openSearch,
    keptFocusOf,
    pinMessage,
  } = useGitActions();
  const keptPin = useGit((state) =>
    worktree === undefined ? undefined : state.pinnedMessages.get(worktree),
  );
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
  const spacer = useRef<HTMLDivElement>(null);
  const hits = useRef<readonly RowHit[]>([]);
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
  const {
    looks: labLooks,
    crowds,
    layout: bubbleRows,
    onAdvances: setBubbleAdvances,
  } = useCrowdedBubbles(history, version);
  const sizes = useMemo(
    () => rowSizes(history, offset, line, scale, bubbleRows),
    [history, offset, line, scale, bubbleRows],
  );
  const rowKey = useCallback(
    (index: number) => rowKeyOf(history, offset, index),
    [history, offset],
  );
  const { scrolling, shift, scrollTop, resized, placed } =
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
  const scrollSettings = useShell((state) => state.scrolling);
  const dateFormat = useShell((state) => state.dateFormat);
  const around = useCommitSurroundings();
  const pulling = useGit((state) => state.tab.pulling);
  const pushing = useGit((state) => state.tab.pushing);
  const pullingBranch = useGit((state) => state.tab.pullingBranch);
  const pushingBranch = useGit((state) => state.tab.pushingBranch);
  const pushingTag = useGit((state) => state.tab.pushingTag);
  const bubbleProbe = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(0);
  const capped = totalSize > scrollCap;
  const startOf = (index: number) =>
    virtualizer.measurementsCache[index]?.start ?? 0;
  const endPad = capped
    ? 0
    : endPaddingToStart(startOf, count, totalSize, room);
  const snapTo = useEffectEvent((top: number, toward: number, max: number) =>
    capped ? top : snappedToStart(startOf, count, top, toward, max),
  );
  const lineStep = useEffectEvent(() => (capped ? 0 : line));
  const perNotch = useEffectEvent(() => scrollSettings.wheelRows);
  const smooth = useEffectEvent(() => scrollSettings.smooth);
  const settles = useEffectEvent(() => scrollSettings.smoothSnap);
  const follower = useRef<RowFollower>(undefined);
  useEffect(() => {
    const element = list.current;
    if (!element) {
      return undefined;
    }
    const measure = () => setRoom(rowRoom(element));
    const following = followRows(element, lineStep, {
      perNotch,
      smooth,
      settles,
      snapTo,
      onPlace: placed,
    });
    follower.current = following;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      following.stop();
      follower.current = undefined;
      observer.disconnect();
    };
  }, [placed]);
  useLayoutEffect(() => virtualizer.measure(), [virtualizer, line]);
  const [, relaidOut] = useReducer((times: number) => times + 1, 0);
  const anchoredBy = useRef(0);
  useLayoutEffect(() => {
    const above = anchoredBy.current;
    if (above === 0) {
      return;
    }
    anchoredBy.current = 0;
    places.moved(above);
    virtualizer.scrollToOffset((virtualizer.scrollOffset ?? 0) + above);
  });
  const laidOutFor = useRef(history);
  const relaid = useCallback(
    (positions: readonly number[] | undefined) => {
      if (positions === undefined) {
        return;
      }
      const samePlaces = laidOutFor.current === history;
      laidOutFor.current = history;
      const { resized: crowdedResized, above } = crowdedResize(
        virtualizer.measurementsCache,
        positions,
        offset,
        sizes.estimateSize,
        samePlaces ? (virtualizer.scrollOffset ?? 0) : undefined,
      );
      if (crowdedResized) {
        anchoredBy.current += above;
        virtualizer.measure();
      }
      relaidOut();
    },
    [history, offset, sizes, virtualizer],
  );
  useLayoutEffect(
    () => relaid(bubbleRows.take(crowds)),
    [bubbleRows, crowds, relaid],
  );
  const settled = useRef(() => {});
  useEffect(() => {
    settled.current = () => relaid(bubbleRows.show());
  }, [bubbleRows, relaid]);
  const [settling] = useState(() =>
    onceQuiet(() => settled.current(), bubblesRest),
  );
  useEffect(() => () => settling.cancel(), [settling]);
  useEffect(() => {
    const element = list.current;
    if (!element) {
      return undefined;
    }
    const hurry = () => settling.hurry();
    element.addEventListener('scroll', hurry, { passive: true });
    return () => element.removeEventListener('scroll', hurry);
  }, [settling]);
  const onBubbleWidth = useCallback(
    (width: number) => {
      if (!bubbleRows.fit(width)) {
        return;
      }
      const drawn = virtualizer.getVirtualIndexes();
      const first = (drawn[0] ?? 0) - offset;
      const last = (drawn.at(-1) ?? -1) - offset;
      relaid(
        bubbleRows.show((position) => position >= first && position <= last),
      );
      if (bubbleRows.waits) {
        settling.schedule();
      }
    },
    [bubbleRows, relaid, virtualizer, offset, settling],
  );
  const total = history?.total;
  const countedCommits = useMemo(() => commitsCounted(total), [total]);
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

  useListPlace({
    listRef: list,
    virtualizer,
    history,
    offset,
    line,
    places,
    worktree,
    scrollTarget,
    scrollTop,
    onScrolled,
    version,
  });

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
    if (!searching && keptFocusOf(tabScopeOf(worktree)) === undefined) {
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
    const [glideTo] =
      (!capped &&
        scrollSettings.smooth &&
        virtualizer.getOffsetForIndex(offset + position, 'auto')) ||
      [];
    if (glideTo !== undefined && follower.current) {
      follower.current.scrollTo(glideTo, true);
    } else {
      virtualizer.scrollToIndex(offset + position, { align: 'auto' });
    }
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

  const indent = (index: number) => indentOf(rowLanes(graphOf(index)));

  const lookParts = [
    history,
    version,
    selected,
    headCommit,
    around,
    dateFormat,
    workingTree,
    pulling,
    pushing,
    pullingBranch,
    pushingBranch,
    pushingTag,
  ];
  const keptLooks = useRef<KeptLooks>(undefined);
  const looksKept = keptIn(keptLooks, lookParts);

  const lookOf = (index: number): RowLook | undefined => {
    const known = looksKept.looks.get(index);
    if (
      known?.kind === 'commit' &&
      known.lines !== bubbleRows.get(index - offset)
    ) {
      looksKept.looks.delete(index);
    }
    return lookIn(looksKept, index, freshLookOf);
  };

  const freshLookOf = (index: number): RowLook | undefined => {
    if (hasWorkingTree && index === 0) {
      const sides = selectionClasses(workingTreeHash, selected);
      return {
        kind: 'workingTree',
        text: strings.commits.uncommittedChanges(workingTree),
        empty: workingTree === 0,
        selected: sides.includes('selected'),
        compareFrom: sides.includes('compare-from'),
      };
    }
    const commit = history?.at(index - offset);
    if (!commit) {
      return { kind: 'placeholder' };
    }
    const sides = selectionClasses(commit.hash, selected);
    return {
      kind: 'commit',
      bubbles: looksOn(commit.hash, around).map((bubble) => {
        const checkedOut =
          bubble.kind === 'head' ||
          (bubble.kind === 'branch' && bubble.text === around.head);
        const running: ActionKey[] =
          bubble.kind === 'tag'
            ? pushingTag.includes(bubble.text)
              ? ['push']
              : []
            : bubble.kind === 'branch'
              ? [
                  ...((
                    checkedOut ? pulling : pullingBranch.includes(bubble.text)
                  )
                    ? (['pull'] as const)
                    : []),
                  ...((
                    checkedOut ? pushing : pushingBranch.includes(bubble.text)
                  )
                    ? (['push'] as const)
                    : []),
                ]
              : [];
        return { look: bubble, checkedOut, running };
      }),
      lines: bubbleRows.get(index - offset),
      subject: commit.subject,
      author: commit.authorName,
      date: formatDate(commit.commitDate, dateFormat),
      checkedOut: commit.hash === headCommit,
      selected: sides.includes('selected'),
      compareFrom: sides.includes('compare-from'),
    };
  };

  const hashOf = (index: number): string | undefined =>
    index < offset ? workingTreeHash : history?.at(index - offset)?.hash;

  const pointer = useCommitPointer({
    list,
    spacer,
    hits,
    hashOf,
    graphOf,
    stashes,
  });

  const selectedRow = () => {
    const hash = sidesOf(selected).at(-1);
    return hits.current.find((row) => hashOf(row.index) === hash);
  };

  return (
    <Column
      focusName="commits"
      overlay={search}
      status={
        <ColumnStatus loading={opening} font="proportional">
          {countedCommits}
        </ColumnStatus>
      }
      search={
        <SearchButton
          title={strings.actions.search}
          onClick={() => openSearch(true)}
        />
      }
      resizer={<ColumnResizer index={0} />}
      start={navigation}
      actions={
        <>
          <SoloButton />
          <CollapseMergesButton />
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
        aria-label={strings.commits.list}
        onKeyDown={onKeyDown}
        onClick={pointer.onClick}
        onPointerDown={pointer.onPointerDown}
        onContextMenu={(event) => {
          if (!menuFromKeyboard(event)) {
            if (!pointer.onContextMenu(event)) {
              event.preventDefault();
            }
            return;
          }
          const target = keyboardMenuTarget(selected, stashes);
          if (!target) {
            return;
          }
          const bounds = event.currentTarget.getBoundingClientRect();
          const origin = spacer.current?.getBoundingClientRect();
          const row = selectedRow();
          openMenu(
            {
              stopPropagation: () => event.stopPropagation(),
              preventDefault: () => event.preventDefault(),
              clientX:
                row === undefined || origin === undefined
                  ? bounds.left
                  : origin.left + row.subjectLeft,
              clientY:
                row === undefined || origin === undefined
                  ? bounds.bottom
                  : origin.top + row.top + row.height,
            },
            target,
          );
        }}
      >
        <div
          className="virtual-spacer"
          ref={spacer}
          style={{ height: realHeight(totalSize) + endPad }}
        >
          <BubbleLab
            looks={labLooks}
            onAdvances={setBubbleAdvances}
            onWidth={onBubbleWidth}
          />
          <BubbleShapes
            shapes={bubbleShapesOf(rows.map((row) => lookOf(row.index)))}
            probe={bubbleProbe}
          />
          {pointer.tipped && (
            <span
              className="commit-tip"
              style={{
                left: pointer.tipped.box.left,
                top: pointer.tipped.box.top,
                width: pointer.tipped.box.width,
                height: pointer.tipped.box.height,
              }}
              {...pointer.tipped.said}
            />
          )}
          <CommitCanvas
            list={list}
            hits={hits}
            bubbleProbe={bubbleProbe}
            lookOf={lookOf}
            indentOf={indent}
            shown={rows.map((row) => row.index)}
            placeOf={(index) => {
              const measured = virtualizer.measurementsCache[index];
              return (
                measured && {
                  top: measured.start - shift,
                  height: measured.size,
                }
              );
            }}
            graphOf={graphOf}
            line={line}
            scale={scale}
          />
        </div>
      </div>
      <MessagePeek
        key={worktree}
        keptPin={keptPin}
        onPin={pinMessage}
        list={list}
        spacer={spacer}
        hits={hits}
        selectedRow={selectedRow}
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
