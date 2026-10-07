import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { uniformHeight } from '../../webview/diffView';
import {
  pinnedRows,
  revealAgain,
  revealOffset,
  scrollTarget,
  VirtualRows,
} from '../../webview/virtualRows';
import { countingReads } from '../fixtures';

suite('Virtual rows', () => {
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

  test('draws only the rows in view of a long list, not every row', () => {
    const drawn: number[] = [];
    const keys = Array.from({ length: 10_000 }, (_, index) => `row:${index}`);
    renderToStaticMarkup(
      <VirtualRows
        rows={{
          count: keys.length,
          keyOf: (index) => keys[index],
          indexOf: (key) => keys.indexOf(key),
        }}
        renderRow={(index) => {
          drawn.push(index);
          return keys[index];
        }}
        selectedKey={undefined}
        initialRect={{ width: 400, height: 240 }}
      />,
    );
    const inView = Array.from({ length: 10 }, (_, index) => index);
    assert.deepStrictEqual(drawn.slice(0, inView.length), inView);
    assert.ok(drawn.length < 100, `${drawn.length} rows drawn`);
  });

  test('sizes the rows not drawn yet at the fixed height of a row, so the list is as long as it will be', () => {
    const html = renderToStaticMarkup(
      <VirtualRows
        rows={{
          count: 1000,
          keyOf: (index) => `row:${index}`,
          indexOf: () => -1,
        }}
        renderRow={() => null}
        selectedKey={undefined}
      />,
    );
    const height = 1000 * uniformHeight;
    assert.match(
      html,
      new RegExp(`class="virtual-spacer" style="height:${height}px"`),
    );
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
    const all = countingReads(rows(100_000));
    assert.deepStrictEqual(
      pinnedRows(all.counted, 1_500_005, () => []),
      [],
    );
    assert.ok(all.reads < 100, `${all.reads} reads`);
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
