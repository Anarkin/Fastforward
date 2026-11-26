import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  areaBetween,
  hitOf,
  touched,
} from '../../../../../tools/canvas/page/hits';
import {
  fileBox,
  movedBy,
  previewed,
  resizedBy,
} from '../../../../../tools/canvas/page/placing';
import type {
  Board,
  BoardNode,
} from '../../../../../tools/canvas/shared/board';

const unit = { width: 7, height: 18 };

const placed = (
  column: number,
  row: number,
  columns: number,
  rows: number,
) => ({
  x: column * unit.width,
  y: row * unit.height,
  width: columns * unit.width,
  height: rows * unit.height,
});

const text = (
  id: string,
  column: number,
  row: number,
  columns = 10,
  rows = 4,
): BoardNode => ({
  id,
  type: 'text',
  text: id,
  ...placed(column, row, columns, rows),
});

const board: Board = {
  nodes: [
    { id: 'g', type: 'group', label: 'G', ...placed(0, 0, 30, 12) },
    text('a', 2, 2),
    text('b', 8, 4),
    text('tiny', 20, 2, 2, 2),
  ],
  edges: [],
};

const none = new Set<string>();

suite('Canvas hits', () => {
  test('finds the topmost node under the pointer, a group only by its border, so a press inside it reaches the canvas', () => {
    assert.deepStrictEqual(hitOf(board, unit, { column: 9, row: 4 }, none), {
      kind: 'node',
      id: 'b',
    });
    assert.deepStrictEqual(hitOf(board, unit, { column: 3, row: 3 }, none), {
      kind: 'node',
      id: 'a',
    });
    assert.deepStrictEqual(hitOf(board, unit, { column: 0, row: 5 }, none), {
      kind: 'node',
      id: 'g',
    });
    assert.deepStrictEqual(hitOf(board, unit, { column: 25, row: 9 }, none), {
      kind: 'empty',
    });
    assert.deepStrictEqual(hitOf(board, unit, { column: 40, row: 5 }, none), {
      kind: 'empty',
    });
  });

  test('takes a press on a side or a corner of a node selected as a handle to size it, but for a node too small for its inside to be told from its border', () => {
    const selected = new Set(['a', 'tiny']);
    assert.deepStrictEqual(
      hitOf(board, unit, { column: 11, row: 5 }, selected),
      {
        kind: 'handle',
        id: 'a',
        sides: { left: false, right: true, top: false, bottom: true },
      },
    );
    assert.deepStrictEqual(
      hitOf(board, unit, { column: 5, row: 2 }, selected),
      {
        kind: 'handle',
        id: 'a',
        sides: { left: false, right: false, top: true, bottom: false },
      },
    );
    assert.deepStrictEqual(
      hitOf(board, unit, { column: 20, row: 2 }, selected),
      { kind: 'node', id: 'tiny' },
    );
  });

  test('selects by a box the nodes it touches and the groups it holds whole', () => {
    assert.deepStrictEqual(
      touched(
        board,
        unit,
        areaBetween({ column: 9, row: 7 }, { column: 3, row: 5 }),
      ),
      ['a', 'b'],
    );
    assert.deepStrictEqual(
      touched(
        board,
        unit,
        areaBetween({ column: -1, row: -1 }, { column: 31, row: 13 }),
      ),
      ['g', 'a', 'b', 'tiny'],
    );
  });
});

suite('Canvas placing', () => {
  test('moves a box by whole cells and sizes it from the sides pressed, never smaller than two cells either way', () => {
    const box = { column: 2, row: 2, columns: 10, rows: 4 };
    assert.deepStrictEqual(movedBy(box, 3, -1), {
      column: 5,
      row: 1,
      columns: 10,
      rows: 4,
    });
    const corner = { left: true, right: false, top: true, bottom: false };
    assert.deepStrictEqual(resizedBy(box, corner, -2, 1), {
      column: 0,
      row: 3,
      columns: 12,
      rows: 3,
    });
    assert.deepStrictEqual(resizedBy(box, corner, 20, 20), {
      column: 10,
      row: 4,
      columns: 2,
      rows: 2,
    });
    const side = { left: false, right: true, top: false, bottom: false };
    assert.deepStrictEqual(resizedBy(box, side, -20, 5), {
      column: 2,
      row: 2,
      columns: 2,
      rows: 4,
    });
  });

  test('writes a box placed on the grid in pixels of the file, as many as its cells', () => {
    assert.deepStrictEqual(
      fileBox('a', { column: -3, row: 2, columns: 10, rows: 4 }, unit),
      {
        id: 'a',
        x: -21,
        y: 36,
        width: 70,
        height: 72,
      },
    );
  });

  test('draws the nodes being moved where they go and the node being placed on top, leaving the canvas itself as it was', () => {
    const shown = previewed(
      board,
      unit,
      new Map([['a', { column: 5, row: 6, columns: 10, rows: 4 }]]),
      {
        type: 'text',
        box: { column: 40, row: 0, columns: 30, rows: 5 },
      },
    );
    assert.deepStrictEqual(shown.nodes[1], text('a', 5, 6));
    assert.deepStrictEqual(shown.nodes.at(-1), {
      id: '',
      type: 'text',
      text: '',
      ...placed(40, 0, 30, 5),
    });
    assert.deepStrictEqual(board.nodes[1], text('a', 2, 2));
  });
});
