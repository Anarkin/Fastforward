import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  dragging,
  pressed,
  released,
} from '../../../../../tools/canvas/page/gestures';
import type {
  Board,
  BoardNode,
} from '../../../../../tools/canvas/shared/board';

const unit = { width: 7, height: 18 };

const text = (id: string, column: number, row: number): BoardNode => ({
  id,
  type: 'text',
  text: id,
  x: column * unit.width,
  y: row * unit.height,
  width: 10 * unit.width,
  height: 4 * unit.height,
});

const board: Board = {
  nodes: [text('a', 0, 0), text('b', 20, 0), text('c', 0, 10)],
  edges: [],
};

suite('Canvas gestures', () => {
  test('selects a node pressed alone, keeps a selection it belongs to, adds to it with Shift and takes it out or puts it in with Mod, without moving anything on Mod', () => {
    const at = { column: 2, row: 2 };
    const hit = { kind: 'node', id: 'a' } as const;
    assert.deepStrictEqual(
      pressed(board, unit, hit, at, ['b'], 'one').selected,
      ['a'],
    );
    assert.deepStrictEqual(
      pressed(board, unit, hit, at, ['a', 'b'], 'one').selected,
      ['a', 'b'],
    );
    assert.deepStrictEqual(
      pressed(board, unit, hit, at, ['b'], 'add').selected,
      ['b', 'a'],
    );
    assert.deepStrictEqual(
      pressed(board, unit, hit, at, ['a', 'b'], 'toggle'),
      { selected: ['b'] },
    );
  });

  test('moves every node selected by the cells the pointer crossed, posting their places in pixels of the file once let go, and nothing for a press let go in its cell', () => {
    const start = pressed(
      board,
      unit,
      { kind: 'node', id: 'a' },
      { column: 2, row: 2 },
      ['a', 'b'],
      'one',
    );
    assert.ok(start.gesture !== undefined);
    const shown = dragging(start.gesture, board, unit, { column: 5, row: 1 });
    assert.deepStrictEqual(
      [...shown.preview.boxes],
      [
        ['a', { column: 3, row: -1, columns: 10, rows: 4 }],
        ['b', { column: 23, row: -1, columns: 10, rows: 4 }],
      ],
    );
    assert.deepStrictEqual(
      released(start.gesture, unit, { column: 5, row: 1 }),
      {
        kind: 'place',
        boxes: [
          { id: 'a', x: 21, y: -18, width: 70, height: 72 },
          { id: 'b', x: 161, y: -18, width: 70, height: 72 },
        ],
      },
    );
    assert.strictEqual(
      released(start.gesture, unit, { column: 2, row: 2 }),
      undefined,
    );
  });

  test('sizes a node by the side or corner pressed', () => {
    const start = pressed(
      board,
      unit,
      {
        kind: 'handle',
        id: 'a',
        sides: { left: false, right: true, top: false, bottom: true },
      },
      { column: 9, row: 3 },
      ['a'],
      'one',
    );
    assert.ok(start.gesture !== undefined);
    assert.deepStrictEqual(
      released(start.gesture, unit, { column: 14, row: 5 }),
      {
        kind: 'place',
        boxes: [{ id: 'a', x: 0, y: 0, width: 105, height: 108 }],
      },
    );
  });

  test('selects the nodes a box drawn from an empty place touches, keeping the selection with Shift', () => {
    const empty = { kind: 'empty' } as const;
    const fresh = pressed(
      board,
      unit,
      empty,
      { column: -2, row: -1 },
      ['c'],
      'one',
    );
    assert.deepStrictEqual(fresh.selected, []);
    assert.ok(fresh.gesture !== undefined);
    assert.deepStrictEqual(
      dragging(fresh.gesture, board, unit, { column: 22, row: 1 }),
      {
        preview: {
          boxes: new Map(),
          area: { column: -2, row: -1, columns: 25, rows: 3 },
        },
        selected: ['a', 'b'],
      },
    );
    const adding = pressed(
      board,
      unit,
      empty,
      { column: -2, row: -1 },
      ['c'],
      'add',
    );
    assert.ok(adding.gesture !== undefined);
    assert.deepStrictEqual(
      dragging(adding.gesture, board, unit, { column: 1, row: 1 }).selected,
      ['c', 'a'],
    );
    assert.strictEqual(
      released(adding.gesture, unit, { column: 1, row: 1 }),
      undefined,
    );
  });
});
