import * as assert from 'node:assert';
import { fullyVisible, listMoveOf, moveInList } from '../webview/listMoves';

suite('Moving in a list', () => {
  test('steps, jumps to either end, and pages to the last row in view before a screen further', () => {
    const rows = { first: 10, last: 19 };
    assert.strictEqual(moveInList('down', 3, 30, rows), 4);
    assert.strictEqual(moveInList('up', 0, 30, rows), undefined);
    assert.strictEqual(moveInList('down', undefined, 30, rows), 0);
    assert.strictEqual(moveInList('first', 12, 30, rows), 0);
    assert.strictEqual(moveInList('last', 12, 30, rows), 29);
    assert.strictEqual(moveInList('pageDown', 12, 30, rows), 19);
    assert.strictEqual(moveInList('pageDown', 19, 30, rows), 28);
    assert.strictEqual(moveInList('pageDown', 28, 30, rows), 29);
    assert.strictEqual(moveInList('pageUp', 15, 30, rows), 10);
    assert.strictEqual(moveInList('pageUp', 10, 30, rows), 1);
    assert.strictEqual(moveInList('last', undefined, 0, rows), undefined);
  });

  test('counts the rows wholly in view, leaving out ones cut off at either edge', () => {
    const rows = [0, 1, 2, 3, 4].map((index) => ({
      index,
      start: index * 40,
      end: (index + 1) * 40,
    }));
    assert.deepStrictEqual(fullyVisible(rows, 10, 100, 0), {
      first: 1,
      last: 1,
    });
    assert.deepStrictEqual(fullyVisible(rows, 0, 120, 1), {
      first: -1,
      last: 1,
    });
    assert.deepStrictEqual(fullyVisible([], 0, 100, 0), { first: 0, last: 0 });
  });

  test('takes only the list keys without modifiers', () => {
    const key = {
      key: 'End',
      code: '',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      target: null,
    };
    assert.strictEqual(listMoveOf(key), 'last');
    assert.strictEqual(listMoveOf({ ...key, key: 'PageUp' }), 'pageUp');
    assert.strictEqual(listMoveOf({ ...key, ctrlKey: true }), undefined);
    assert.strictEqual(listMoveOf({ ...key, shiftKey: true }), undefined);
    assert.strictEqual(listMoveOf({ ...key, key: 'Enter' }), undefined);
  });
});
