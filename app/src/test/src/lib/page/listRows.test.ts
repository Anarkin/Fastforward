import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  revealAgain,
  revealOffset,
  scrollTarget,
} from '../../../../lib/page/listRows';

suite('List rows', () => {
  test('scrolls to the selected row again once it arrives, as a tree loads after its file was selected', () => {
    assert.strictEqual(scrollTarget('a', []), undefined);
    assert.strictEqual(scrollTarget('a', ['b', 'c']), undefined);
    assert.strictEqual(scrollTarget('a', ['b', 'a']), 'a');
    assert.strictEqual(scrollTarget(undefined, ['a']), undefined);
  });

  test('scrolls to the selected row again once the rows it reveals with change, as unchanged files load above a selected one', () => {
    const files = ['b'];
    const tree = ['a', 'b'];
    assert.ok(revealAgain(undefined, { key: 'b', rows: files }));
    assert.ok(
      !revealAgain({ key: 'b', rows: files }, { key: 'b', rows: files }),
    );
    assert.ok(revealAgain({ key: 'b', rows: files }, { key: 'b', rows: tree }));
    assert.ok(revealAgain({ key: 'b', rows: tree }, { key: 'a', rows: tree }));
    assert.ok(
      !revealAgain({ key: 'b', rows: files }, { key: undefined, rows: tree }),
    );
  });

  test('compares the values it reveals with one by one, so the same values given anew reveal nothing', () => {
    assert.ok(
      !revealAgain(
        { key: 'b', rows: ['one', true] },
        { key: 'b', rows: ['one', true] },
      ),
    );
    assert.ok(
      revealAgain(
        { key: 'b', rows: ['one', true] },
        { key: 'b', rows: ['one', false] },
      ),
    );
    assert.ok(
      revealAgain(
        { key: 'b', rows: ['one', true] },
        { key: 'b', rows: ['two', true] },
      ),
    );
  });
});

suite('Revealing a row', () => {
  const row = { start: 200, end: 220 };

  test('leaves a row alone that is in view below the pinned folders', () => {
    assert.strictEqual(revealOffset(row, 100, 300, 40), undefined);
  });

  test('scrolls a row hidden under the pinned folders, or above the view, to just below them', () => {
    assert.strictEqual(revealOffset(row, 180, 300, 40), 160);
    assert.strictEqual(revealOffset(row, 250, 300, 0), 200);
    assert.strictEqual(revealOffset({ start: 10, end: 30 }, 20, 300, 40), 0);
  });

  test('scrolls a row below the view up to its bottom', () => {
    assert.strictEqual(revealOffset(row, 0, 150, 40), 70);
  });
});
