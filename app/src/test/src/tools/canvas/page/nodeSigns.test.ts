import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { BoardNode } from '../../../../../tools/canvas/shared/board';
import { signAt } from '../../../../../tools/canvas/page/nodeSigns';

const unit = { width: 7, height: 18 };

const box = (column: number, row: number, columns: number, rows: number) => ({
  x: column * unit.width,
  y: row * unit.height,
  width: columns * unit.width,
  height: rows * unit.height,
});

const board = (...nodes: BoardNode[]) => ({ nodes, edges: [] });

suite('Signs of the kinds of nodes', () => {
  test('tells the kind of the node whose sign is under a cell, for a tooltip to name it, and nothing beside the sign', () => {
    const drawn = board(
      { id: 'note', type: 'text', text: '', ...box(0, 0, 6, 3) },
      { id: 'file', type: 'file', file: 'a.md', ...box(10, 0, 6, 3) },
      { id: 'link', type: 'link', url: 'https://a.b', ...box(20, 0, 6, 3) },
    );
    assert.deepStrictEqual(
      [
        { column: 1, row: 0 },
        { column: 11, row: 0 },
        { column: 21, row: 0 },
        { column: 2, row: 0 },
        { column: 1, row: 1 },
      ].map((at) => signAt(drawn, unit, at)),
      ['text', 'file', 'link', undefined, undefined],
    );
  });

  test('tells no sign of a group, nor of a node another node is drawn over, groups drawn under the rest', () => {
    const drawn = board(
      { id: 'under', type: 'text', text: '', ...box(0, 0, 6, 3) },
      { id: 'over', type: 'link', url: 'https://a.b', ...box(1, 0, 4, 3) },
      { id: 'group', type: 'group', ...box(10, 0, 6, 3) },
      { id: 'held', type: 'file', file: 'a.md', ...box(10, 0, 4, 3) },
    );
    assert.strictEqual(signAt(drawn, unit, { column: 1, row: 0 }), undefined);
    assert.strictEqual(signAt(drawn, unit, { column: 2, row: 0 }), 'link');
    assert.strictEqual(signAt(drawn, unit, { column: 11, row: 0 }), 'file');
    assert.strictEqual(
      signAt(board({ id: 'group', type: 'group', ...box(0, 0, 6, 3) }), unit, {
        column: 1,
        row: 0,
      }),
      undefined,
    );
  });
});
