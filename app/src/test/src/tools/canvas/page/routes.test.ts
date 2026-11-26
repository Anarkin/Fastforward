import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  normalOf,
  reversed,
  routeOf,
  type Cell,
} from '../../../../../tools/canvas/page/routes';
import type { Box } from '../../../../../tools/canvas/page/grid';

const unit = { width: 7, height: 18 };

const box = (column: number, row: number, columns = 10, rows = 3): Box => ({
  column,
  row,
  columns,
  rows,
});

const steps = (cells: readonly Cell[]) =>
  cells.slice(1).map((cell, at) => {
    const before = cells[at] ?? cell;
    return [cell.column - before.column, cell.row - before.row];
  });

const turns = (cells: readonly Cell[]) =>
  steps(cells).filter((step, at, all) => {
    const before = all[at - 1];
    return (
      before !== undefined && (before[0] !== step[0] || before[1] !== step[1])
    );
  }).length;

function assertWhole(cells: readonly Cell[]): void {
  for (const [across, down] of steps(cells)) {
    assert.strictEqual(Math.abs(across ?? 0) + Math.abs(down ?? 0), 1);
  }
  const all = steps(cells);
  for (let at = 1; at < all.length; at++) {
    const [across, down] = all[at] ?? [];
    const [before, under] = all[at - 1] ?? [];
    assert.ok(
      across !== -(before ?? 0) ||
        down !== -(under ?? 0) ||
        (across === 0 && down === 0),
      'doubles back',
    );
  }
}

suite('Canvas edge routes', () => {
  test('runs straight from the cell beside one side to the cell beside the other when they face each other on a row', () => {
    const route = routeOf(box(0, 0), box(20, 0), unit, 'right', 'left');
    assert.deepStrictEqual(route.from, { column: 10, row: 1 });
    assert.deepStrictEqual(route.to, { column: 19, row: 1 });
    assert.deepStrictEqual(
      route.cells,
      Array.from({ length: 10 }, (_, at) => ({ column: 10 + at, row: 1 })),
    );
  });

  test('turns once from a side into the top of a node below it, as the sketch of the canvas has it', () => {
    const route = routeOf(box(0, 0), box(11, 4), unit, 'right', 'top');
    assert.deepStrictEqual(route.cells, [
      { column: 10, row: 1 },
      { column: 11, row: 1 },
      { column: 12, row: 1 },
      { column: 13, row: 1 },
      { column: 14, row: 1 },
      { column: 15, row: 1 },
      { column: 15, row: 2 },
      { column: 15, row: 3 },
    ]);
  });

  test('turns twice halfway between two sides that face each other on different rows', () => {
    const route = routeOf(box(0, 0), box(20, 10), unit, 'right', 'left');
    assertWhole(route.cells);
    assert.strictEqual(turns(route.cells), 2);
    assert.deepStrictEqual(route.cells.at(-1), { column: 19, row: 11 });
  });

  test('leaves a side outward and comes into the other from outside, around a node facing away, never doubling back', () => {
    for (const [from, to, fromSide, toSide] of [
      [box(20, 0), box(0, 0), 'right', 'left'],
      [box(0, 0), box(20, 0), 'left', 'right'],
      [box(0, 0), box(0, 10), 'top', 'bottom'],
      [box(0, 0), box(0, 0), 'right', 'top'],
      [box(0, 10), box(30, 0), 'bottom', 'top'],
    ] as const) {
      const { cells } = routeOf(from, to, unit, fromSide, toSide);
      assertWhole(cells);
      const [first, second] = steps(cells);
      const last = steps(cells).at(-1);
      assert.deepStrictEqual(
        first,
        [normalOf(fromSide).column, normalOf(fromSide).row],
        `${fromSide} ${toSide}`,
      );
      assert.deepStrictEqual(
        last,
        [reversed(normalOf(toSide)).column, reversed(normalOf(toSide)).row],
        `${fromSide} ${toSide}`,
      );
      assert.ok(second !== undefined);
    }
  });

  test('picks the sides that face each other when the file names none, by the distance in pixels rather than in cells', () => {
    const across = routeOf(box(0, 0), box(30, 2), unit);
    assert.deepStrictEqual([across.fromSide, across.toSide], ['right', 'left']);
    const down = routeOf(box(0, 0), box(4, 8), unit);
    assert.deepStrictEqual([down.fromSide, down.toSide], ['bottom', 'top']);
    const steep = routeOf(box(0, 0), box(10, 5), unit);
    assert.deepStrictEqual([steep.fromSide, steep.toSide], ['bottom', 'top']);
  });
});
