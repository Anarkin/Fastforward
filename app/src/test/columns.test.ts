import * as assert from 'node:assert';
import {
  columnsClass,
  draggedWidths,
  followDrag,
  maxWidth,
  resetWidth,
  shownSelection,
  templateOf,
  widthsToLoad,
} from '../webview/columns';
import { workingTreeHash } from '../shared/protocol';

function dragTarget() {
  const listeners = new Map<string, (event: { buttons: number }) => void>();
  return {
    addEventListener: (
      type: string,
      listener: (event: { buttons: number }) => void,
    ) => {
      listeners.set(type, listener);
    },
    removeEventListener: (type: string) => {
      listeners.delete(type);
    },
    dispatch: (type: string, buttons: number) =>
      listeners.get(type)?.({ buttons }),
  };
}

suite('Columns', () => {
  test('gives a hidden column no width instead of dropping it, so it keeps its place', () => {
    assert.strictEqual(
      templateOf([460, 300], [true, false]),
      '0px 300px minmax(240px, 1fr)',
    );
    assert.strictEqual(
      templateOf([460, 300], [false, false]),
      '460px 300px minmax(240px, 1fr)',
    );
  });

  test('leaves the last column its room, which a hidden column does not take', () => {
    assert.strictEqual(maxWidth([460, 300], [false, false], 0, 1000), 460);
    assert.strictEqual(maxWidth([460, 300], [true, false], 1, 1000), 760);
    assert.strictEqual(maxWidth([460, 300], [false, false], 1, 500), 120);
  });

  test('loads saved widths, or the defaults for ones of other columns', () => {
    const defaults = [460, 300];
    assert.deepStrictEqual(widthsToLoad([400, 250], defaults), [400, 250]);
    assert.strictEqual(widthsToLoad([400], defaults), defaults);
  });

  test('drags a column to a whole width between its least and most', () => {
    assert.deepStrictEqual(
      draggedWidths([400, 250], 1, -1000, 500),
      [400, 120],
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

  test('stops following a drag the browser cancels, or whose button went up unseen', () => {
    for (const [type, buttons] of [
      ['pointercancel', 1],
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
});

suite('Columns', () => {
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

suite('Shown selection', () => {
  test('lays out a clean working tree, selected, like nothing selected, as there is nothing to show beside it', () => {
    assert.strictEqual(shownSelection(workingTreeHash, 0), undefined);
    assert.strictEqual(shownSelection(workingTreeHash, undefined), undefined);
    assert.strictEqual(shownSelection(workingTreeHash, 2), workingTreeHash);
    assert.strictEqual(shownSelection('a', 0), 'a');
    assert.strictEqual(shownSelection(undefined, 2), undefined);
  });
});
