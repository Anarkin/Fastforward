import * as assert from 'node:assert';
import {
  columnsClass,
  listError,
  draggedWidths,
  followDrag,
  maxWidth,
  minColumnWidths,
  minLastColumnWidth,
  resetWidth,
  shownSelection,
  templateOf,
  widthsToLoad,
} from '../../webview/columns';
import { minimumWindowSize } from '../../main/files';
import { workingTreeHash } from '../../shared/protocol';
import { stylesheetPx } from '../fixtures';

type DragListener = (event: { buttons: number }) => void;

function dragTarget() {
  const listeners = new Map<string, Set<DragListener>>();
  return {
    addEventListener: (type: string, listener: DragListener) => {
      listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
    },
    removeEventListener: (type: string, listener: DragListener) => {
      listeners.get(type)?.delete(listener);
    },
    dispatch: (type: string, buttons: number) => {
      for (const listener of listeners.get(type) ?? []) {
        listener({ buttons });
      }
    },
  };
}

suite('Columns', () => {
  test('gives a hidden column no width instead of dropping it, so it keeps its place', () => {
    assert.strictEqual(
      templateOf([460, 300], [true, false]),
      '0px minmax(150px, 300px) minmax(240px, 1fr)',
    );
  });

  test('narrows the columns to fit a narrow window, keeping the last one its room, rather than pushing it out of view', () => {
    assert.strictEqual(
      templateOf([460, 300], [false, false]),
      'minmax(275px, 460px) minmax(150px, 300px) minmax(240px, 1fr)',
    );
  });

  test('leaves the last column its room, which a hidden column does not take', () => {
    assert.strictEqual(maxWidth([460, 300], [false, false], 0, 1000, 0), 460);
    assert.strictEqual(maxWidth([460, 300], [true, false], 1, 1000, 0), 760);
    assert.strictEqual(maxWidth([460, 300], [false, false], 1, 500, 0), 150);
    assert.strictEqual(maxWidth([460, 300], [false, false], 0, 500, 0), 275);
  });

  test('fits every column at its least width in the smallest window, past the padding and gaps between them', () => {
    const gutter = stylesheetPx(/--gutter-width: (\d+)px;/);
    const columns = minColumnWidths.length + 1;
    const least =
      minColumnWidths.reduce((sum, width) => sum + width, 0) +
      minLastColumnWidth +
      (columns + 1) * gutter;
    assert.ok(least <= minimumWindowSize.width, `${least}`);
  });

  test('leaves the last column its room past the padding and gaps between the columns', () => {
    assert.strictEqual(maxWidth([460, 300], [false, false], 0, 1000, 16), 444);
  });

  test('loads saved widths, or the defaults for ones of other columns', () => {
    const defaults = [460, 300];
    assert.deepStrictEqual(widthsToLoad([400, 250], defaults), [400, 250]);
    assert.strictEqual(widthsToLoad([400], defaults), defaults);
  });

  test('drags a column to a whole width between its least and most', () => {
    assert.deepStrictEqual(
      draggedWidths([400, 250], 1, -1000, 500),
      [400, 150],
    );
    assert.deepStrictEqual(
      draggedWidths([400, 250], 0, -1000, 500),
      [275, 250],
    );
    assert.deepStrictEqual(
      draggedWidths([400, 250], 1, 10000, 500),
      [400, 500],
    );
    assert.deepStrictEqual(draggedWidths([400, 250], 0, 10.6, 500), [411, 250]);
  });

  test('resets only the column asked', () => {
    assert.deepStrictEqual(resetWidth([400, 250], 1, [460, 300]), [400, 300]);
  });

  test('stops following a drag the browser cancels or takes the pointer from, or whose button went up unseen', () => {
    for (const [type, buttons] of [
      ['pointercancel', 1],
      ['lostpointercapture', 1],
      ['pointerup', 0],
      ['pointermove', 0],
    ] as const) {
      const target = dragTarget();
      let moves = 0;
      let ends = 0;
      followDrag(
        target,
        () => moves++,
        () => ends++,
      );
      target.dispatch('pointermove', 1);
      target.dispatch(type, buttons);
      target.dispatch('pointermove', 1);
      target.dispatch('pointerup', 0);
      assert.deepStrictEqual([moves, ends], [1, 1], type);
    }
  });

  test('hides the commits on request, and the other columns while no commit is selected', () => {
    assert.strictEqual(columnsClass(true, 'a'), 'columns');
    assert.strictEqual(columnsClass(false, 'a'), 'columns commits-hidden');
    assert.strictEqual(
      columnsClass(true, undefined),
      'columns nothing-selected',
    );
    assert.strictEqual(
      columnsClass(false, undefined),
      'columns commits-hidden nothing-selected',
    );
  });
});

suite('Error placement', () => {
  test('shows an error in the commit list while nothing is selected, as the other columns are hidden then', () => {
    assert.strictEqual(
      listError('Not a repository', undefined),
      'Not a repository',
    );
    assert.strictEqual(listError('Not a repository', 'a'), undefined);
    assert.strictEqual(listError(undefined, undefined), undefined);
  });
});

suite('Shown selection', () => {
  test('lays out a clean working tree, selected, like nothing selected, as there is nothing to show beside it', () => {
    assert.strictEqual(shownSelection(workingTreeHash, 0), undefined);
    assert.strictEqual(shownSelection(workingTreeHash, undefined), undefined);
    assert.strictEqual(shownSelection(workingTreeHash, 2), workingTreeHash);
    assert.strictEqual(shownSelection('a', 0), 'a');
    assert.strictEqual(shownSelection(undefined, 2), undefined);
  });
});
