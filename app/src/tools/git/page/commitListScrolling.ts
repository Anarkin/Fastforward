import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from 'react';
import {
  type Virtualizer,
  type VirtualizerOptions,
} from '@tanstack/react-virtual';
import { workingTreeHash, type ScrollTarget } from '../shared/protocol';
import { CommitHistory } from './commitHistory';

const scrolledDelay = 150;

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
  maxTop = Infinity,
): number {
  const pulledUp =
    reportedTop !== undefined && scrollTop < reportedTop && scrollTop >= maxTop;
  return (
    start +
    offset +
    (reportedTop === undefined || pulledUp ? 0 : scrollTop - reportedTop)
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
    maxTop?: number,
  ): number {
    const top = keptPlace(
      start,
      offset,
      scrollTop,
      report === undefined ? undefined : this.tops.get(report),
      maxTop,
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

export function useListPlace({
  listRef,
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
}: {
  readonly listRef: RefObject<HTMLDivElement | null>;
  readonly virtualizer: Virtualizer<HTMLDivElement, Element>;
  readonly history: CommitHistory | undefined;
  readonly offset: number;
  readonly line: number;
  readonly places: ReportedPlaces;
  readonly worktree: string | undefined;
  readonly scrollTarget: ScrollTarget | undefined;
  readonly scrollTop: (element: Element | null) => number;
  readonly onScrolled: (top: string, offset: number, report: number) => void;
  readonly version: number;
}): void {
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
      const element = listRef.current;
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
            scrollTop(listRef.current),
            action.target.report,
            virtualizer.getTotalSize() - (listRef.current?.clientHeight ?? 0),
          ),
        );
      }
      return;
    }
    const onScreen = virtualizer
      .getVirtualItems()
      .some((row) => row.index === index);
    virtualizer.scrollToIndex(index, { align: onScreen ? 'auto' : 'center' });
  }, [
    listRef,
    history,
    scrollTarget,
    offset,
    virtualizer,
    scrollTop,
    places,
    line,
  ]);

  const topNow = useCallback(() => {
    const element = listRef.current;
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
  }, [listRef, history, offset, onScrolled, virtualizer, scrollTop, places]);
  const reportUntold = useScrollReports(listRef, topNow);
  useEffect(reportUntold, [version, reportUntold]);
}
