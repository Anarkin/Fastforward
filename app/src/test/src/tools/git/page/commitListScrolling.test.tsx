import * as assert from 'node:assert';
import { suite, test, vi } from 'vitest';
import { act, useCallback, useLayoutEffect, useRef } from 'react';
import { JSDOM } from 'jsdom';
import { Virtualizer } from '@tanstack/react-virtual';
import {
  workingTreeHash,
  type GraphRow,
  type ScrollTarget,
} from '../../../../../tools/git/shared/protocol';
import { CommitHistory } from '../../../../../tools/git/page/commitHistory';
import { createGitStore, GitStore } from '../../../../../tools/git/page/store';
import { commitInfo } from '../../../../helpers/fixtures';
import { laidOutElement } from '../../../../helpers/elementFixtures';
import { noop, loaded } from './commitListFixtures';
import {
  keptPlace,
  ReportedPlaces,
  trailing,
  useScrollReports,
  atMostEvery,
  movingPlaces,
  workingTreeShift,
} from '../../../../../tools/git/page/commitListScrolling';
import {
  bubbleLineHeight,
  commitRowHeight,
  listTop,
  workingTreeRowHeight,
} from '../../../../../tools/git/page/commitListRows';
import { Commits } from '../../../../../tools/git/page/commitList';

const unchangingMedia = (window: JSDOM['window']) => (): MediaQueryList =>
  Object.assign(new window.EventTarget(), {
    matches: false,
    media: '',
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
  });
import { renderIn } from '../../../../helpers/componentFixtures';

suite('Commit list top', () => {
  const rows = [0, 1, 2].map((index) => ({
    index,
    start: index * commitRowHeight,
    end: (index + 1) * commitRowHeight,
  }));

  test('is the commit scrolled into, once it is loaded', () => {
    const history = new CommitHistory(2);
    const scrollTop = commitRowHeight + 10;
    assert.strictEqual(listTop(rows, scrollTop, history, 1), undefined);
    history.add(0, [commitInfo('a'), commitInfo('b')]);
    assert.deepStrictEqual(listTop(rows, scrollTop, history, 1), {
      hash: 'a',
      offset: 10,
    });
  });

  test('is the working tree all the way up and within its row, as far into it as it is scrolled, so a new history keeps that place', () => {
    const history = new CommitHistory(2);
    assert.deepStrictEqual(listTop(rows, 0, history, 1), {
      hash: workingTreeHash,
      offset: 0,
    });
    assert.deepStrictEqual(listTop(rows, 10, history, 1), {
      hash: workingTreeHash,
      offset: 10,
    });
  });

  test('is the row a scroll ends exactly at, a first commit without a working tree, and nothing past the rows', () => {
    const history = new CommitHistory(3);
    history.add(0, [commitInfo('a'), commitInfo('b'), commitInfo('c')]);
    assert.deepStrictEqual(listTop(rows, commitRowHeight, history, 1), {
      hash: 'a',
      offset: 0,
    });
    assert.deepStrictEqual(listTop(rows, 10, history, 0), {
      hash: 'a',
      offset: 10,
    });
    assert.strictEqual(
      listTop(rows, 3 * commitRowHeight + 1, history, 0),
      undefined,
    );
  });

  test('keeps its place by what was scrolled since the place it last told', () => {
    assert.strictEqual(keptPlace(1000, 7, 400, 400), 1007);
    assert.strictEqual(keptPlace(1000, 7, 900, 400), 1507);
    assert.strictEqual(keptPlace(1000, 7, 900, undefined), 1007);
  });

  test('keeps its place by what was scrolled since it was told, not by how far the browser pulled a list grown shorter up to its new end', () => {
    assert.strictEqual(keptPlace(1500, 0, 1500, 2000, 1500), 1500);
    assert.strictEqual(keptPlace(1500, 0, 1200, 2000, 1500), 700);
    const places = new ReportedPlaces();
    const told = places.told(2000);
    assert.strictEqual(places.kept(1500, 0, 1500, told, 1500), 1500);
  });

  test('keeps its place only once when another history comes before its own scroll is told', () => {
    const places = new ReportedPlaces();
    const told = places.told(400);
    const first = places.kept(1000, 7, 900, told);
    assert.strictEqual(places.kept(1300, 7, first, told), 1807);
    const unscrolled = places.kept(1000, 7, 0, undefined);
    assert.strictEqual(places.kept(1300, 7, unscrolled, undefined), 1307);
  });
});

suite('Places told', () => {
  test('keeps its place by what was scrolled since the place a history kept was told, though a later one was told since', () => {
    const places = new ReportedPlaces();
    const kept = places.told(400);
    places.told(2400);
    assert.strictEqual(places.kept(1000, 7, 2400, kept), 3007);
  });

  test('moves the places told since by as much as keeping a place scrolled, as the rows above them moved too', () => {
    const places = new ReportedPlaces();
    const kept = places.told(400);
    const later = places.told(2400);
    places.kept(1000, 7, 2400, kept);
    assert.strictEqual(places.kept(3307, 0, 3007, later), 3307);
  });

  test('keeps a place told before it was forgotten, or never told, as it is', () => {
    const places = new ReportedPlaces();
    const kept = places.told(400);
    places.forget();
    assert.strictEqual(places.kept(1000, 7, 900, kept), 1007);
    assert.strictEqual(places.kept(1000, 7, 900, undefined), 1007);
  });

  test('keeps its place by what was scrolled since the place told, not by the list moving the rows in view down as the working tree row appears above them', () => {
    const top = 20 * commitRowHeight;
    const places = new ReportedPlaces();
    const told = places.told(top);
    const shifted = workingTreeShift(top, 1, workingTreeRowHeight) ?? 0;
    places.moved(shifted - top);
    const start = workingTreeRowHeight + 20 * commitRowHeight;
    assert.strictEqual(places.kept(start, 0, shifted, told), shifted);
    const later = places.told(shifted + 200);
    places.moved(bubbleLineHeight);
    assert.strictEqual(
      places.kept(start + 200, 0, shifted + 200 + bubbleLineHeight, later),
      start + 200,
    );
  });

  test('keeps its place by what was scrolled since the place told, not by the list keeping its rows in view as one above them is measured taller', () => {
    const top = 20 * commitRowHeight;
    const places = new ReportedPlaces();
    const scroller = laidOutElement({ clientHeight: 500, scrollTop: top });
    const virtualizer = new Virtualizer<Element, Element>({
      count: 100,
      estimateSize: () => commitRowHeight,
      initialOffset: scroller.scrollTop,
      getScrollElement: () => scroller,
      observeElementRect: (_instance, report) => {
        report({ width: 300, height: scroller.clientHeight });
        return noop;
      },
      observeElementOffset: () => noop,
      scrollToFn: movingPlaces(places, (offset, { adjustments = 0 }) => {
        scroller.scrollTop = offset + adjustments;
      }),
    });
    virtualizer._willUpdate();
    virtualizer.getVirtualItems();
    const told = places.told(scroller.scrollTop);
    virtualizer.resizeItem(5, commitRowHeight + bubbleLineHeight);
    assert.strictEqual(scroller.scrollTop, top + bubbleLineHeight);
    const start = 20 * commitRowHeight + bubbleLineHeight;
    assert.strictEqual(
      places.kept(start, 0, scroller.scrollTop, told),
      scroller.scrollTop,
    );
  });
});

suite('Telling the place scrolled to', () => {
  test('tells once scrolling stops, and at once when its list changes before then', async () => {
    let told = 0;
    const tell = trailing(() => told++, 10);
    tell.schedule();
    tell.schedule();
    tell.flush();
    assert.strictEqual(told, 1);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.strictEqual(told, 1);
    tell.flush();
    assert.strictEqual(told, 1);
    tell.schedule();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.strictEqual(told, 2);
  });

  test('tells a scroll made as another history is drawn as a place in that history, as the browser scrolls a list emptied or replaced before effects run, which told the place as one in the history shown before', async () => {
    const dom = new JSDOM('<!doctype html><main></main>');
    dom.window.matchMedia = unchangingMedia(dom.window);
    const globals = {
      window: dom.window,
      document: dom.window.document,
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    const before = Object.fromEntries(
      Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
    );
    Object.assign(globalThis, globals);
    try {
      const { createRoot } = await import('react-dom/client');
      const told: string[] = [];
      const listOf = () => dom.window.document.querySelector('main > div');
      function List({ history }: { history: string }) {
        const list = useRef<HTMLDivElement>(null);
        const topNow = useCallback(
          () => () => {
            told.push(history);
            return true;
          },
          [history],
        );
        useScrollReports(list, topNow);
        return <div ref={list} />;
      }
      function ScrolledAsDrawn() {
        useLayoutEffect(() => {
          listOf()?.dispatchEvent(new dom.window.Event('scroll'));
        }, []);
        return null;
      }
      const main = dom.window.document.querySelector('main');
      assert.ok(main);
      const root = createRoot(main);
      await act(async () => {
        renderIn(root, <List history="before" />);
      });
      await act(async () => {
        renderIn(
          root,
          <>
            <List history="after" />
            <ScrolledAsDrawn />
          </>,
        );
      });
      await act(async () => {
        root.unmount();
      });
      assert.deepStrictEqual(told, ['after']);
    } finally {
      Object.assign(globalThis, before);
    }
  });
});

suite('Asking for the pages in view', () => {
  test('asks at once, then at most once a delay however often it is asked meanwhile, and at once again after a quiet delay', async () => {
    let asked = 0;
    const ask = atMostEvery(() => asked++, 20);
    ask.schedule();
    assert.strictEqual(asked, 1);
    ask.schedule();
    ask.schedule();
    assert.strictEqual(asked, 1);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.strictEqual(asked, 2);
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.strictEqual(asked, 2);
    ask.schedule();
    assert.strictEqual(asked, 3);
    ask.schedule();
    ask.cancel();
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.strictEqual(asked, 3);
  });
});

const longHistory = (prefix: string) =>
  loaded(...Array.from({ length: 1000 }, (_, index) => `${prefix}${index}`));

interface ToldPlace {
  readonly hash: string;
  readonly offset: number;
  readonly report: number;
}

const placeIn = (history: CommitHistory, place: ToldPlace | undefined) =>
  place && {
    index: history.positionOf(place.hash) ?? 0,
    offset: place.offset,
    report: place.report,
  };

const laidOutSize = (element: Element) =>
  element.classList.contains('list')
    ? 500
    : element.classList.contains('virtual-row')
      ? commitRowHeight
      : 0;

const laidOutContent = (element: Element) =>
  Math.max(
    laidOutSize(element),
    parseFloat(
      element.querySelector<HTMLElement>(':scope > .virtual-spacer')?.style
        .height ?? '',
    ) || 0,
  );

const listSettled = () => act(() => vi.advanceTimersByTimeAsync(200));

async function scrollingList(
  check: (list: {
    readonly show: (
      worktree: string,
      history: CommitHistory | undefined,
      scrollTarget?: ScrollTarget,
      headCommit?: string,
    ) => Promise<void>;
    readonly scroll: (top: number) => Promise<void>;
    readonly select: (hash: string) => Promise<void>;
    readonly top: () => number;
    readonly told: () => ToldPlace | undefined;
  }) => Promise<void>,
): Promise<void> {
  const dom = new JSDOM('<!doctype html><main></main>', {
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.matchMedia = unchangingMedia(window);
  const tops = new WeakMap<Element, number>();
  const scrollTo = (element: Element, top: number) => {
    const next = Math.max(
      0,
      Math.min(top, laidOutContent(element) - laidOutSize(element)),
    );
    if ((tops.get(element) ?? 0) !== next) {
      tops.set(element, next);
      window.setTimeout(() =>
        element.dispatchEvent(new window.Event('scroll')),
      );
    }
    return next;
  };
  Object.defineProperties(window.HTMLElement.prototype, {
    offsetWidth: { get: () => 300 },
    offsetHeight: {
      get(this: HTMLElement) {
        return laidOutSize(this);
      },
    },
    getBoundingClientRect: {
      value(this: HTMLElement) {
        return new window.DOMRect(0, 0, 300, laidOutSize(this));
      },
    },
    clientHeight: {
      get(this: HTMLElement) {
        return laidOutSize(this);
      },
    },
    scrollHeight: {
      get(this: HTMLElement) {
        return laidOutContent(this);
      },
    },
    scrollTop: {
      get(this: HTMLElement) {
        return scrollTo(this, tops.get(this) ?? 0);
      },
      set(this: HTMLElement, top: number) {
        scrollTo(this, top);
      },
    },
    scrollTo: {
      value(this: HTMLElement, { top }: ScrollToOptions) {
        scrollTo(this, top ?? 0);
      },
    },
  });
  const globals = {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const saved = Object.fromEntries(
    Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
  );
  Object.assign(globalThis, globals);
  const { createRoot } = await import('react-dom/client');
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    const main = window.document.querySelector('main');
    assert.ok(main);
    const root = createRoot(main);
    const told: ToldPlace[] = [];
    const store = createGitStore((message) => {
      if (message.type === 'scrolled') {
        told.push({
          hash: message.hash,
          offset: message.offset,
          report: message.report,
        });
      }
    });
    const list = () => {
      const found = main.querySelector('.list');
      assert.ok(found);
      return found;
    };
    await check({
      show: async (worktree, history, scrollTarget, headCommit) => {
        await act(async () => {
          store.setState({
            tab: {
              ...store.getState().tab,
              root: worktree,
              history,
              scrollTarget,
              ...(headCommit !== undefined && {
                repository: { head: 'main', headCommit, refs: [], stashes: [] },
              }),
            },
          });
          renderIn(
            root,
            <GitStore value={store}>
              <Commits />
            </GitStore>,
          );
        });
        await listSettled();
      },
      scroll: async (top) => {
        list().scrollTop = top;
        await listSettled();
        list().dispatchEvent(new window.Event('scroll'));
        await listSettled();
      },
      select: async (hash) => {
        await act(async () => {
          store.setState({ tab: { ...store.getState().tab, hash } });
        });
      },
      top: () => list().scrollTop,
      told: () => told.at(-1),
    });
    await act(async () => {
      root.unmount();
    });
  } finally {
    vi.useRealTimers();
    Object.assign(globalThis, saved);
  }
}

suite('Commit list places', () => {
  test('opens the history of another worktree where it was left, or at its top, also when it is drawn straight after the history it replaces, as the page may take both at once while busy', async () => {
    await scrollingList(async ({ show, scroll, top, told }) => {
      await show('a', longHistory('a'));
      await scroll(10_000);
      const leftA = told();
      await show('b', undefined);
      await show('b', longHistory('b'));
      assert.strictEqual(top(), 0);
      await scroll(2_000);
      const leftB = told();
      const backToA = longHistory('a');
      await show('a', backToA, placeIn(backToA, leftA));
      assert.strictEqual(top(), 10_000);
      const backToB = longHistory('b');
      await show('b', backToB, placeIn(backToB, leftB));
      assert.strictEqual(top(), 2_000);
      await show('c', longHistory('c'));
      assert.strictEqual(top(), 0);
    });
  });
});

function countedHistory(count: number, reads: Map<string, number>) {
  const read = (key: string) => reads.set(key, (reads.get(key) ?? 0) + 1);
  const history = new CommitHistory(count);
  history.add(
    0,
    Array.from({ length: count }, (_, index) => ({
      ...commitInfo(`c${index}`),
      get subject() {
        read(`row c${index}`);
        return `c${index}`;
      },
    })),
    Array.from({ length: count }, (_, index): GraphRow => ({
      lane: 0,
      lines: [{ from: 0, to: 0, color: 0, bottom: true, dashed: true }],
      get color() {
        read(`graph c${index}`);
        return 0;
      },
    })),
  );
  return history;
}

suite('Commit list drawing', () => {
  test('draws a row and its graph again only when what they show changes, not on each frame of a scroll nor for another row selected, also above the checked-out commit, whose graph leaves out the line from the working tree', async () => {
    const reads = new Map<string, number>();
    const drawnAgain = (drawn: ReadonlyMap<string, number>) =>
      [...drawn]
        .filter(([key, count]) => reads.get(key) !== count)
        .map(([key]) => key);
    await scrollingList(async ({ show, scroll, select }) => {
      await show('a', countedHistory(1000, reads), undefined, 'c500');
      await scroll(200);
      const drawn = new Map(reads);
      assert.ok(drawn.has('row c10') && drawn.has('graph c10'));
      await scroll(260);
      assert.deepStrictEqual(drawnAgain(drawn), []);
      const scrolled = new Map(reads);
      await select('c12');
      assert.deepStrictEqual(drawnAgain(scrolled), ['row c12']);
      const selected = new Map(reads);
      await select('c14');
      assert.deepStrictEqual(drawnAgain(selected), ['row c12', 'row c14']);
    });
  });
});
