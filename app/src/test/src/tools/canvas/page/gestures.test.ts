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
      released(start.gesture, board, unit, { column: 5, row: 1 }),
      {
        kind: 'place',
        boxes: [
          { id: 'a', x: 21, y: -18, width: 70, height: 72 },
          { id: 'b', x: 161, y: -18, width: 70, height: 72 },
        ],
      },
    );
    assert.strictEqual(
      released(start.gesture, board, unit, { column: 2, row: 2 }),
      undefined,
    );
  });

  test('moves the nodes a group moved holds whole along with it, as Obsidian moves them, leaving a node only partly inside it where it is', () => {
    const grouped: Board = {
      nodes: [
        {
          id: 'g',
          type: 'group',
          x: 0,
          y: 0,
          width: 30 * unit.width,
          height: 12 * unit.height,
        },
        text('a', 1, 1),
        text('b', 25, 1),
        text('c', 40, 1),
      ],
      edges: [],
    };
    const start = pressed(
      grouped,
      unit,
      { kind: 'node', id: 'g' },
      { column: 5, row: 0 },
      [],
      'one',
    );
    assert.deepStrictEqual(start.selected, ['g']);
    assert.ok(start.gesture !== undefined);
    assert.deepStrictEqual(
      released(start.gesture, grouped, unit, { column: 7, row: 1 }),
      {
        kind: 'place',
        boxes: [
          { id: 'g', x: 14, y: 18, width: 210, height: 216 },
          { id: 'a', x: 21, y: 36, width: 70, height: 72 },
        ],
      },
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
      released(start.gesture, board, unit, { column: 14, row: 5 }),
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
      released(adding.gesture, board, unit, { column: 1, row: 1 }),
      undefined,
    );
  });

  test('draws an edge from the mark of a side to the pointer, to the side of the node under it nearest the pointer, joining them once let go there, and nothing once let go over no other node', () => {
    const start = pressed(
      board,
      unit,
      { kind: 'mark', id: 'a', side: 'right' },
      { column: 10, row: 1 },
      ['c'],
      'one',
    );
    assert.deepStrictEqual(start.selected, ['c']);
    assert.ok(start.gesture !== undefined);
    assert.deepStrictEqual(
      dragging(start.gesture, board, unit, { column: 15, row: 6 }).preview.wire,
      {
        fromNode: 'a',
        fromSide: 'right',
        to: { at: { column: 15, row: 6 } },
      },
    );
    assert.deepStrictEqual(
      dragging(start.gesture, board, unit, { column: 21, row: 1 }).preview.wire
        ?.to,
      { node: 'b', side: 'left' },
    );
    assert.deepStrictEqual(
      released(start.gesture, board, unit, { column: 21, row: 1 }),
      {
        kind: 'connect',
        fromNode: 'a',
        fromSide: 'right',
        toNode: 'b',
        toSide: 'left',
      },
    );
    assert.strictEqual(
      released(start.gesture, board, unit, { column: 15, row: 6 }),
      undefined,
    );
    assert.strictEqual(
      released(start.gesture, board, unit, { column: 5, row: 2 }),
      undefined,
    );
  });

  test('selects an edge clicked, adds it with Shift and takes it out or puts it in with Mod, moving nothing', () => {
    const hit = { kind: 'edge', id: 'ab' } as const;
    const at = { column: 15, row: 1 };
    assert.deepStrictEqual(pressed(board, unit, hit, at, ['a'], 'one'), {
      selected: ['ab'],
    });
    assert.deepStrictEqual(pressed(board, unit, hit, at, ['a'], 'add'), {
      selected: ['a', 'ab'],
    });
    assert.deepStrictEqual(
      pressed(board, unit, hit, at, ['a', 'ab'], 'toggle'),
      { selected: ['a'] },
    );
  });
});
