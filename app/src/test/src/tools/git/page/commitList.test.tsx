import * as assert from 'node:assert';
import { suite, test, vi } from 'vitest';
import { act } from 'react';
import { JSDOM } from 'jsdom';
import {
  type GraphRow,
  type ScrollTarget,
} from '../../../../../tools/git/shared/protocol';
import { CommitHistory } from '../../../../../tools/git/page/commitHistory';
import { createGitStore, GitStore } from '../../../../../tools/git/page/store';
import { commitRowHeight } from '../../../../../tools/git/page/commitListRows';
import { loaded, unchangingMedia } from './commitListFixtures';
import { Commits } from '../../../../../tools/git/page/commitList';
import { renderIn } from '../../../../helpers/componentFixtures';
import { commitInfo } from '../../../../helpers/gitValues';

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
