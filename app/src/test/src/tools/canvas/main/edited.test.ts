import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { EditedBoard } from '../../../../../tools/canvas/main/edited';
import { editOf } from '../../../../../tools/canvas/main/edits';

const node = (id: string, x = 0, more: Record<string, unknown> = {}) => ({
  id,
  type: 'text',
  text: id,
  x,
  y: 0,
  width: 70,
  height: 54,
  ...more,
});

const canvas = JSON.stringify(
  {
    nodes: [
      node('a'),
      node('b', 140, { color: '2', zIndex: 4 }),
      { id: 'odd', type: 'sticker', x: 0, y: 0, width: 1, height: 1 },
    ],
    edges: [
      { id: 'ab', fromNode: 'a', toNode: 'b', label: 'x' },
      { id: 'ba', fromNode: 'b', toNode: 'a' },
    ],
    metadata: { kept: true },
  },
  null,
  '\t',
);

const idsOf = (board: EditedBoard) => {
  const read = board.read();
  assert.ok(read.kind === 'board');
  return {
    nodes: read.board.nodes.map((each) => `${each.id}@${each.x}`),
    edges: read.board.edges.map((each) => each.id),
  };
};

const ids = () => {
  let made = 0;
  return () => `new${++made}`;
};

suite('Canvas edited', () => {
  test('places nodes where the page moved or sized them, keeping every other field of theirs and of the file, a node it cannot read too', () => {
    const board = new EditedBoard(canvas);
    assert.deepStrictEqual(
      board.apply(
        {
          kind: 'place',
          boxes: [{ id: 'b', x: 210, y: 18, width: 77, height: 72 }],
        },
        ids(),
      ),
      {},
    );
    const written: unknown = JSON.parse(board.text());
    const original: unknown = JSON.parse(canvas);
    assert.ok(typeof original === 'object' && original !== null);
    assert.deepStrictEqual(written, {
      ...original,
      nodes: [
        node('a'),
        {
          ...node('b', 210, { color: '2', zIndex: 4 }),
          y: 18,
          width: 77,
          height: 72,
        },
        { id: 'odd', type: 'sticker', x: 0, y: 0, width: 1, height: 1 },
      ],
    });
  });

  test('adds a text node on top of the others and a group under them, under an id of its own, and says which', () => {
    const board = new EditedBoard(canvas);
    const made = ids();
    assert.deepStrictEqual(
      board.apply(
        {
          kind: 'add',
          node: { type: 'text', x: 7, y: 18, width: 70, height: 54 },
        },
        made,
      ),
      { made: 'new1' },
    );
    board.apply(
      {
        kind: 'add',
        node: { type: 'group', x: 0, y: 0, width: 280, height: 180 },
      },
      made,
    );
    assert.deepStrictEqual(idsOf(board).nodes, [
      'new2@0',
      'a@0',
      'b@140',
      'new1@7',
    ]);
  });

  test('points the edges asked for one way, the other way, both ways or neither, writing an end only where it differs from what JSON Canvas takes it to be without one, as Obsidian writes it', () => {
    const board = new EditedBoard(canvas);
    const ends = (fromEnd: 'none' | 'arrow', toEnd: 'none' | 'arrow') =>
      board.apply({ kind: 'ends', edges: ['ab', 'ba'], fromEnd, toEnd }, ids());
    const written = () => {
      const parsed: unknown = JSON.parse(board.text());
      assert.ok(
        typeof parsed === 'object' &&
          parsed !== null &&
          'edges' in parsed &&
          Array.isArray(parsed.edges),
      );
      return parsed.edges.map((edge: unknown) =>
        ['id', 'fromEnd', 'toEnd'].map((key) =>
          typeof edge === 'object' && edge !== null
            ? Reflect.get(edge, key)
            : undefined,
        ),
      );
    };
    assert.deepStrictEqual(ends('arrow', 'none'), {});
    assert.deepStrictEqual(written(), [
      ['ab', 'arrow', 'none'],
      ['ba', 'arrow', 'none'],
    ]);
    ends('arrow', 'arrow');
    assert.deepStrictEqual(written(), [
      ['ab', 'arrow', undefined],
      ['ba', 'arrow', undefined],
    ]);
    ends('none', 'arrow');
    assert.deepStrictEqual(written(), [
      ['ab', undefined, undefined],
      ['ba', undefined, undefined],
    ]);
    assert.strictEqual(ends('none', 'arrow'), undefined);
    assert.ok(board.undo());
    assert.deepStrictEqual(written()[0], ['ab', 'arrow', undefined]);
  });

  test('connects two nodes by an edge from a side of one to a side of the other, under an id of its own, as Obsidian writes an edge, and never a node to itself or to one not there', () => {
    const board = new EditedBoard(canvas);
    const connect = (fromNode: string, toNode: string) =>
      board.apply(
        {
          kind: 'connect',
          fromNode,
          fromSide: 'right',
          toNode,
          toSide: 'top',
        },
        ids(),
      );
    assert.deepStrictEqual(connect('a', 'b'), { made: 'new1' });
    assert.strictEqual(connect('a', 'a'), undefined);
    assert.strictEqual(connect('a', 'gone'), undefined);
    assert.deepStrictEqual(JSON.parse(board.text()).edges.at(-1), {
      id: 'new1',
      fromNode: 'a',
      fromSide: 'right',
      toNode: 'b',
      toSide: 'top',
    });
    assert.deepStrictEqual(idsOf(board).edges, ['ab', 'ba', 'new1']);
  });

  test('deletes the nodes and edges asked for, and every edge to a node deleted', () => {
    const board = new EditedBoard(canvas);
    board.apply({ kind: 'delete', nodes: ['a'], edges: [] }, ids());
    assert.deepStrictEqual(idsOf(board), { nodes: ['b@140'], edges: [] });
    const other = new EditedBoard(canvas);
    other.apply({ kind: 'delete', nodes: [], edges: ['ab'] }, ids());
    assert.deepStrictEqual(idsOf(other).edges, ['ba']);
  });

  test('takes nothing that changes nothing as an edit, so it is neither undone nor changes the file', () => {
    const board = new EditedBoard(canvas);
    assert.strictEqual(
      board.apply({ kind: 'place', boxes: [node('a')] }, ids()),
      undefined,
    );
    assert.strictEqual(
      board.apply({ kind: 'delete', nodes: ['gone'], edges: [] }, ids()),
      undefined,
    );
    assert.strictEqual(board.changed(), false);
    assert.strictEqual(board.undo(), false);
  });

  test('undoes and redoes edits, changed while it differs from what was last saved, and for good once an edit leaves what was saved behind', () => {
    const board = new EditedBoard(canvas);
    const move = (x: number) =>
      board.apply({ kind: 'place', boxes: [{ ...node('a'), x }] }, ids());
    move(7);
    move(14);
    assert.strictEqual(board.changed(), true);
    board.saved();
    assert.strictEqual(board.changed(), false);
    assert.ok(board.undo());
    assert.deepStrictEqual(idsOf(board).nodes[0], 'a@7');
    assert.strictEqual(board.changed(), true);
    assert.ok(board.redo());
    assert.strictEqual(board.changed(), false);
    assert.strictEqual(board.redo(), false);
    board.undo();
    move(21);
    board.undo();
    assert.deepStrictEqual(idsOf(board).nodes[0], 'a@7');
    assert.strictEqual(board.changed(), true);
  });

  test('writes the text typed into a text node, the keystrokes of one typing one change undone at once, and another typing, an undo or a save starting another', () => {
    const board = new EditedBoard(canvas);
    const typed = (text: string, session: number, id = 'a') =>
      board.apply({ kind: 'text', id, text, session }, ids());
    const textOf = (id: string) => {
      const read = board.read();
      assert.ok(read.kind === 'board');
      const found = read.board.nodes.find((each) => each.id === id);
      return found?.type === 'text' ? found.text : undefined;
    };
    assert.deepStrictEqual(typed('a1', 1), {});
    assert.deepStrictEqual(typed('a12', 1), {});
    assert.strictEqual(typed('a12', 1), undefined);
    typed('b1', 1, 'b');
    typed('a123', 1);
    assert.ok(board.undo());
    assert.strictEqual(textOf('a'), 'a12');
    assert.ok(board.undo());
    assert.strictEqual(textOf('b'), 'b');
    assert.ok(board.undo());
    assert.strictEqual(textOf('a'), 'a');
    assert.strictEqual(board.changed(), false);
    typed('ab', 2);
    board.saved();
    typed('abc', 2);
    assert.strictEqual(board.changed(), true);
    board.undo();
    assert.strictEqual(textOf('a'), 'ab');
    assert.strictEqual(board.changed(), false);
    typed('abd', 2);
    typed('abde', 3);
    board.undo();
    assert.strictEqual(textOf('a'), 'abd');
    assert.strictEqual(
      board.apply({ kind: 'text', id: 'odd', text: 'x', session: 4 }, ids()),
      undefined,
    );
  });

  test('takes from the page only edits whole and in bounds, as the page is not trusted', () => {
    assert.deepStrictEqual(
      editOf({
        kind: 'place',
        boxes: [{ id: 'a', x: -7, y: 18, width: 70, height: 54 }],
      }),
      {
        kind: 'place',
        boxes: [{ id: 'a', x: -7, y: 18, width: 70, height: 54 }],
      },
    );
    assert.deepStrictEqual(
      editOf({ kind: 'text', id: 'a', text: 'Line\r\nnext', session: 7 }),
      { kind: 'text', id: 'a', text: 'Line\r\nnext', session: 7 },
    );
    for (const forged of [
      {
        kind: 'place',
        boxes: [{ id: 'a', x: 0.5, y: 0, width: 70, height: 54 }],
      },
      { kind: 'place', boxes: [{ id: '', x: 0, y: 0, width: 70, height: 54 }] },
      { kind: 'place', boxes: [{ id: 'a', x: 0, y: 0, width: 0, height: 54 }] },
      { kind: 'place', boxes: 'all' },
      {
        kind: 'add',
        node: { type: 'file', x: 0, y: 0, width: 70, height: 54 },
      },
      {
        kind: 'add',
        node: { type: 'text', x: 2e9, y: 0, width: 70, height: 54 },
      },
      { kind: 'delete', nodes: [3], edges: [] },
      { kind: 'text', id: 'a', text: 4, session: 1 },
      {
        kind: 'connect',
        fromNode: 'a',
        fromSide: 'middle',
        toNode: 'b',
        toSide: 'top',
      },
      { kind: 'connect', fromNode: 'a', fromSide: 'left', toNode: 'b' },
      { kind: 'ends', edges: ['ab'], fromEnd: 'arrow', toEnd: 'both' },
      { kind: 'ends', edges: 'ab', fromEnd: 'arrow', toEnd: 'none' },
      { kind: 'text', id: 'a', text: 'x', session: 0.5 },
      { kind: 'text', id: '', text: 'x', session: 1 },
      { kind: 'rename' },
      'delete',
    ]) {
      assert.strictEqual(editOf(forged), undefined, JSON.stringify(forged));
    }
  });
});
