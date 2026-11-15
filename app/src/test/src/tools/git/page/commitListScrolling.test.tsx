import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { act, useCallback, useLayoutEffect, useRef } from 'react';
import { JSDOM } from 'jsdom';
import { Virtualizer } from '@tanstack/react-virtual';
import { workingTreeHash } from '../../../../../tools/git/shared/protocol';
import { CommitHistory } from '../../../../../tools/git/page/commitHistory';
import { laidOutElement } from '../../../../helpers/elementFixtures';
import { noop, unchangingMedia } from './commitListFixtures';
import {
  keptPlace,
  ReportedPlaces,
  trailing,
  useScrollReports,
  movingPlaces,
  workingTreeShift,
  listTop,
  listScroll,
} from '../../../../../tools/git/page/commitListScrolling';
import {
  bubbleLineHeight,
  commitRowHeight,
  workingTreeRowHeight,
} from '../../../../../tools/git/page/commitListRows';
import { renderIn } from '../../../../helpers/componentFixtures';
import { commitInfo } from '../../../../helpers/gitValues';

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

suite('Commit list working tree row', () => {
  test('keeps a scrolled list in place when the working tree row appears above it', () => {
    assert.strictEqual(
      workingTreeShift(500, 1, workingTreeRowHeight),
      500 + workingTreeRowHeight,
    );
    assert.strictEqual(
      workingTreeShift(500 + workingTreeRowHeight, -1, workingTreeRowHeight),
      500,
    );
    assert.strictEqual(workingTreeShift(0, 1, workingTreeRowHeight), undefined);
  });

  test('shifts the list rather than scrolling to its target again when only the working tree row comes or goes', () => {
    const target = { index: 3 };
    assert.deepStrictEqual(
      listScroll({ target, offset: 0 }, { target, offset: 1 }),
      { shiftBy: 1 },
    );
  });

  test('scrolls to a new target without shifting, even when the working tree row appears with it', () => {
    const target = { index: 3 };
    assert.deepStrictEqual(
      listScroll({ target: { index: 3 }, offset: 0 }, { target, offset: 1 }),
      { target },
    );
  });

  test('leaves the list alone when neither its target nor the working tree row changes', () => {
    const target = { index: 3 };
    assert.strictEqual(
      listScroll({ target, offset: 1 }, { target, offset: 1 }),
      undefined,
    );
  });
});
