import * as assert from 'node:assert';
import { pinnedRows, revealOffset, scrollTarget } from '../webview/virtualRows';

suite('Virtual rows', () => {
  test('scrolls to the selected row again once it arrives, as a tree loads after its file was selected', () => {
    assert.strictEqual(scrollTarget('a', []), undefined);
    assert.strictEqual(scrollTarget('a', ['b', 'c']), undefined);
    assert.strictEqual(scrollTarget('a', ['b', 'a']), 'a');
    assert.strictEqual(scrollTarget(undefined, ['a']), undefined);
  });
});

function rows(count: number): { start: number; end: number }[] {
  return Array.from({ length: count }, (_, i) => ({
    start: i * 20,
    end: i * 20 + 20,
  }));
}

suite('Pinned rows', () => {
  const parents: Record<number, number[]> = {
    1: [0],
    2: [0, 1],
    3: [0, 1],
    4: [0, 1],
    5: [0],
    6: [],
  };
  const ancestorsOf = (index: number) => parents[index] ?? [];

  test('pins nothing at the top, or while the folders are still in view', () => {
    assert.deepStrictEqual(pinnedRows(rows(7), 0, ancestorsOf), []);
  });

  test('pins the folders of the row at the top, under the folders pinned above it', () => {
    assert.deepStrictEqual(pinnedRows(rows(7), 25, ancestorsOf), [0, 1]);
    assert.deepStrictEqual(pinnedRows(rows(7), 45, ancestorsOf), [0, 1]);
  });

  test('pins fewer folders once a shallower row comes under them', () => {
    assert.deepStrictEqual(pinnedRows(rows(7), 81, ancestorsOf), [0]);
    assert.deepStrictEqual(pinnedRows(rows(7), 110, ancestorsOf), []);
  });

  test('finds the row at the top of a long list reading only a few rows', () => {
    const all = rows(100_000);
    let reads = 0;
    const counted = new Proxy(all, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) {
          reads++;
        }
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
    assert.deepStrictEqual(
      pinnedRows(counted, 1_500_005, () => []),
      [],
    );
    assert.ok(reads < 100, `${reads} reads`);
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
