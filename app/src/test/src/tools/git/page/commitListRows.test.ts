import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { Virtualizer } from '@tanstack/react-virtual';
import { workingTreeHash } from '../../../../../tools/git/shared/protocol';
import { CommitHistory } from '../../../../../tools/git/page/commitHistory';
import {
  laidOutElement,
  laidOutRow,
} from '../../../../helpers/elementFixtures';
import { noop } from './commitListFixtures';
import {
  bubbleLineHeight,
  commitRowHeight,
  drawnRows,
  estimatedRowHeight,
  fixedRowHeight,
  rowKeyOf,
  rowSizes,
  workingTreeRowHeight,
} from '../../../../../tools/git/page/commitListRows';
import { commitOption } from '../../../../../tools/git/page/commitListItems';
import { commitInfo } from '../../../../helpers/gitValues';

function laidOut(line = bubbleLineHeight, ratio = 1) {
  const scroller = laidOutElement({ clientHeight: 500 });
  const scrolling = {
    getScrollElement: () => scroller,
    observeElementRect: (
      _instance: unknown,
      report: (rect: { width: number; height: number }) => void,
    ) => {
      report({ width: 300, height: scroller.clientHeight });
      return noop;
    },
    observeElementOffset: () => noop,
    scrollToFn: noop,
  };
  const virtualizer = new Virtualizer<Element, Element>({
    ...scrolling,
    count: 0,
    estimateSize: () => commitRowHeight,
  });
  virtualizer._willUpdate();
  const drawn = () => drawnRows(virtualizer, virtualizer.options.getItemKey);
  return {
    drawn,
    lay: (history: CommitHistory, offset = 0) => {
      virtualizer.setOptions({
        ...scrolling,
        count: offset + history.total,
        ...rowSizes(history, offset, line, ratio),
        getItemKey: (index) => rowKeyOf(history, offset, index),
      });
      drawn();
    },
    draw: (index: number, height: number) => {
      drawn();
      virtualizer.measureElement(laidOutRow(height, index));
      return virtualizer.getVirtualItems();
    },
  };
}

suite('Commit list rows', () => {
  test('starts a row with bubbles at one line of them', () => {
    const history = new CommitHistory(3, [1]);
    assert.strictEqual(estimatedRowHeight(history, 0, 0), commitRowHeight);
    assert.strictEqual(
      estimatedRowHeight(history, 0, 1),
      commitRowHeight + bubbleLineHeight,
    );
    assert.strictEqual(estimatedRowHeight(history, 1, 0), workingTreeRowHeight);
    assert.strictEqual(
      estimatedRowHeight(history, 1, 2),
      commitRowHeight + bubbleLineHeight,
    );
  });

  test('sizes the rows from the line height measured, two lines for a commit, a line more for its bubbles, one line for the working tree', () => {
    const history = new CommitHistory(3, [1]);
    assert.deepStrictEqual(
      [
        estimatedRowHeight(history, 1, 0, 20),
        estimatedRowHeight(history, 1, 1, 20),
        estimatedRowHeight(history, 1, 2, 20),
      ],
      [20, 40, 60],
    );
  });

  test('keys a row by its commit, so it keeps its height as the list changes', () => {
    const history = new CommitHistory(3);
    history.add(0, [commitInfo('a'), commitInfo('b')]);
    assert.strictEqual(rowKeyOf(history, 1, 0), workingTreeHash);
    assert.strictEqual(rowKeyOf(history, 1, 2), 'b');
    assert.strictEqual(rowKeyOf(history, 0, 1), 'b');
    assert.strictEqual(rowKeyOf(history, 0, 2), 2);
  });

  test('keys a drawn row by its commit once the page of it loads, though the list laid it out before, telling screen readers which row is selected', () => {
    const history = new CommitHistory(3);
    history.add(0, [commitInfo('a'), commitInfo('b')]);
    const list = laidOut();
    list.lay(history);
    assert.deepStrictEqual(
      list.drawn().map((row) => row.key),
      ['a', 'b', 2],
    );
    history.add(2, [commitInfo('c')]);
    const drawn = list.drawn();
    assert.deepStrictEqual(
      drawn.map((row) => row.key),
      ['a', 'b', 'c'],
    );
    assert.strictEqual(
      commitOption('commits', drawn[2].key, 2, 3, 'c')['aria-selected'],
      true,
    );
  });

  test("keeps a commit not loaded yet at the height it is estimated at, so the list doesn't move when it loads", () => {
    const history = new CommitHistory(3);
    history.add(0, [commitInfo('a')]);
    assert.strictEqual(fixedRowHeight(history, 1, 0, 30), undefined);
    assert.strictEqual(fixedRowHeight(history, 1, 1, 30), undefined);
    assert.strictEqual(fixedRowHeight(history, 1, 2, 30), 30);
    assert.strictEqual(fixedRowHeight(undefined, 0, 0, 30), 30);
  });

  test('lays a commit out at the height drawn once its page loads, though that height was measured in an earlier history', () => {
    const wrapped = commitRowHeight + 2 * bubbleLineHeight;
    const { lay, draw } = laidOut();
    const earlier = new CommitHistory(2, [0]);
    earlier.add(0, [commitInfo('a'), commitInfo('b')]);
    lay(earlier);
    assert.strictEqual(draw(0, wrapped)[1].start, wrapped);
    const later = new CommitHistory(2, [0]);
    lay(later);
    later.add(0, [commitInfo('a'), commitInfo('b')]);
    assert.strictEqual(draw(0, wrapped)[1].start, wrapped);
  });

  test('starts each row where the lines of the rows above it end, at 125% the rows after an uncommitted changes row of 17.6 and commits of 35.2 at 22, 66 and 110 device pixels rather than the 22.5 and 66.25 of rows rounded to whole CSS pixels, so their lines meet those of the files beside them and no pale line shows under the uncommitted changes', () => {
    const line = 17.6;
    const { lay, draw } = laidOut(line, 1.25);
    const history = new CommitHistory(3);
    history.add(0, [commitInfo('a'), commitInfo('b'), commitInfo('c')]);
    lay(history, 1);
    draw(0, line);
    draw(1, 2 * line);
    const rows = draw(2, 2 * line);
    assert.deepStrictEqual(
      rows.slice(0, 4).map((row) => Math.round(row.start * 1.25 * 1000) / 1000),
      [0, 22, 66, 110],
    );
  });
});
