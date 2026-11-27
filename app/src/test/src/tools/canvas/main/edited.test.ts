import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { EditedBoard } from '../../../../../tools/canvas/main/edited';
import { editOf } from '../../../../../tools/canvas/main/edits';
import type { NodeSide } from '../../../../../tools/canvas/shared/board';

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

  test('colors the nodes and edges asked for by one of the six colors of JSON Canvas or a color of its own, and takes their color away, writing the field only while one is chosen', () => {
    const board = new EditedBoard(canvas);
    const colors = () => {
      const parsed: unknown = JSON.parse(board.text());
      assert.ok(typeof parsed === 'object' && parsed !== null);
      return ['nodes', 'edges'].flatMap((key) => {
        const listed: unknown = Reflect.get(parsed, key);
        assert.ok(Array.isArray(listed));
        return listed.map((each: unknown) =>
          typeof each === 'object' && each !== null
            ? [Reflect.get(each, 'id'), Reflect.get(each, 'color')]
            : [],
        );
      });
    };
    assert.deepStrictEqual(
      board.apply(
        { kind: 'color', nodes: ['a'], edges: ['ab'], color: '4' },
        ids(),
      ),
      {},
    );
    board.apply(
      { kind: 'color', nodes: ['b'], edges: [], color: '#ff8800' },
      ids(),
    );
    assert.deepStrictEqual(colors(), [
      ['a', '4'],
      ['b', '#ff8800'],
      ['odd', undefined],
      ['ab', '4'],
      ['ba', undefined],
    ]);
    board.apply({ kind: 'color', nodes: ['a', 'b'], edges: ['ab'] }, ids());
    assert.deepStrictEqual(colors(), [
      ['a', undefined],
      ['b', undefined],
      ['odd', undefined],
      ['ab', undefined],
      ['ba', undefined],
    ]);
    assert.strictEqual(
      board.apply({ kind: 'color', nodes: ['a'], edges: ['ab'] }, ids()),
      undefined,
    );
  });

  test('brings the nodes asked for to the front, over every other, and sends them to the back, under every other, keeping their order among themselves and the nodes it cannot read where they are among the rest', () => {
    const board = new EditedBoard(canvas);
    const order = () => {
      const parsed: unknown = JSON.parse(board.text());
      assert.ok(typeof parsed === 'object' && parsed !== null);
      const nodes: unknown = Reflect.get(parsed, 'nodes');
      assert.ok(Array.isArray(nodes));
      return nodes.map((each: unknown) =>
        typeof each === 'object' && each !== null
          ? Reflect.get(each, 'id')
          : undefined,
      );
    };
    assert.deepStrictEqual(
      board.apply({ kind: 'order', nodes: ['a'], to: 'front' }, ids()),
      {},
    );
    assert.deepStrictEqual(order(), ['b', 'odd', 'a']);
    board.apply({ kind: 'order', nodes: ['b', 'a'], to: 'back' }, ids());
    assert.deepStrictEqual(order(), ['b', 'a', 'odd']);
    assert.strictEqual(
      board.apply({ kind: 'order', nodes: ['b', 'a'], to: 'back' }, ids()),
      undefined,
    );
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
    board.saved(board.checkpoint());
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
    board.saved(board.checkpoint());
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

  test('writes the label typed into a group, one it had or one it had none of, as the text of a text node is written', () => {
    const box = { x: 0, y: 0, width: 140, height: 90 };
    const board = new EditedBoard(
      JSON.stringify({
        nodes: [
          { id: 'g', type: 'group', label: 'Plan', ...box },
          { id: 'h', type: 'group', ...box },
        ],
      }),
    );
    board.apply({ kind: 'text', id: 'g', text: 'Plans', session: 1 }, ids());
    board.apply({ kind: 'text', id: 'h', text: 'Ideas', session: 2 }, ids());
    const labels = () => {
      const read = board.read();
      assert.ok(read.kind === 'board');
      return read.board.nodes.map((each) =>
        each.type === 'group' ? each.label : undefined,
      );
    };
    assert.deepStrictEqual(labels(), ['Plans', 'Ideas']);
    board.undo();
    assert.deepStrictEqual(labels(), ['Plans', undefined]);
  });

  test('writes the line typed into a file node as its path and the subpath after its first #, and into a link node as its URL, never a line break', () => {
    const box = { x: 0, y: 0, width: 140, height: 90 };
    const board = new EditedBoard(
      JSON.stringify({
        nodes: [
          { id: 'f', type: 'file', file: 'a.md', subpath: '#Old', ...box },
          { id: 'l', type: 'link', url: 'https://a.example/', ...box },
        ],
      }),
    );
    const shown = () => {
      const read = board.read();
      assert.ok(read.kind === 'board');
      return read.board.nodes.map((each) =>
        each.type === 'file'
          ? [each.file, each.subpath]
          : each.type === 'link'
            ? each.url
            : undefined,
      );
    };
    board.apply(
      { kind: 'text', id: 'f', text: 'notes/b.md#Steps#more', session: 1 },
      ids(),
    );
    board.apply(
      { kind: 'text', id: 'l', text: 'https://b.example/', session: 2 },
      ids(),
    );
    assert.deepStrictEqual(shown(), [
      ['notes/b.md', '#Steps#more'],
      'https://b.example/',
    ]);
    board.apply({ kind: 'text', id: 'f', text: 'c.md', session: 3 }, ids());
    assert.deepStrictEqual(shown()[0], ['c.md', undefined]);
    assert.strictEqual(
      board.apply({ kind: 'text', id: 'l', text: 'a\nb', session: 4 }, ids()),
      undefined,
    );
    board.undo();
    assert.deepStrictEqual(shown()[0], ['notes/b.md', '#Steps#more']);
  });

  test('writes the label typed onto an edge, one it had or one it had none of, as the label of a group is written', () => {
    const board = new EditedBoard(
      JSON.stringify({
        nodes: [node('a'), node('b', 140)],
        edges: [
          { id: 'named', fromNode: 'a', toNode: 'b', label: 'uses' },
          { id: 'bare', fromNode: 'b', toNode: 'a' },
        ],
      }),
    );
    board.apply(
      { kind: 'text', id: 'named', text: 'calls', session: 1 },
      ids(),
    );
    board.apply(
      { kind: 'text', id: 'bare', text: 'returns', session: 2 },
      ids(),
    );
    const labels = () => {
      const read = board.read();
      assert.ok(read.kind === 'board');
      return read.board.edges.map((each) => each.label);
    };
    assert.deepStrictEqual(labels(), ['calls', 'returns']);
    board.undo();
    assert.deepStrictEqual(labels(), ['calls', undefined]);
  });

  test('moves an end of an edge to a side of another node, refusing a node not there and the node at its other end, as one change undone at once', () => {
    const board = new EditedBoard(
      JSON.stringify({
        nodes: [node('a'), node('b', 140), node('c', 280)],
        edges: [
          {
            id: 'e',
            fromNode: 'a',
            fromSide: 'right',
            toNode: 'b',
            toSide: 'left',
          },
        ],
      }),
    );
    const ends = () => {
      const read = board.read();
      assert.ok(read.kind === 'board');
      const [edge] = read.board.edges;
      return [edge?.fromNode, edge?.fromSide, edge?.toNode, edge?.toSide];
    };
    const reroute = (end: 'from' | 'to', to: string, side: NodeSide) =>
      board.apply({ kind: 'reroute', edge: 'e', end, node: to, side }, ids());
    assert.ok(reroute('to', 'c', 'top'));
    assert.deepStrictEqual(ends(), ['a', 'right', 'c', 'top']);
    assert.ok(!reroute('from', 'c', 'left'));
    assert.ok(!reroute('from', 'gone', 'left'));
    assert.ok(reroute('from', 'b', 'bottom'));
    assert.deepStrictEqual(ends(), ['b', 'bottom', 'c', 'top']);
    board.undo();
    assert.deepStrictEqual(ends(), ['a', 'right', 'c', 'top']);
    assert.deepStrictEqual(
      [
        editOf({
          kind: 'reroute',
          edge: 'e',
          end: 'to',
          node: 'c',
          side: 'top',
        }),
        editOf({
          kind: 'reroute',
          edge: 'e',
          end: 'middle',
          node: 'c',
          side: 'top',
        }),
        editOf({
          kind: 'reroute',
          edge: 'e',
          end: 'to',
          node: 'c',
          side: 'up',
        }),
        editOf({ kind: 'reroute', edge: 7, end: 'to', node: 'c', side: 'top' }),
      ],
      [
        { kind: 'reroute', edge: 'e', end: 'to', node: 'c', side: 'top' },
        undefined,
        undefined,
        undefined,
      ],
    );
  });

  test('places a link node of the URL pasted where it is asked, taking a URL only as a string of a length a URL has', () => {
    const board = new EditedBoard(JSON.stringify({ nodes: [] }));
    const box = { x: 14, y: 36, width: 210, height: 90 };
    assert.deepStrictEqual(
      board.apply({ kind: 'link', url: 'https://example.com/', box }, ids()),
      { made: 'new1' },
    );
    const read = board.read();
    assert.ok(read.kind === 'board');
    assert.deepStrictEqual(read.board.nodes, [
      { id: 'new1', type: 'link', url: 'https://example.com/', ...box },
    ]);
    assert.deepStrictEqual(
      [
        editOf({ kind: 'link', url: 'https://example.com/', box }),
        editOf({ kind: 'link', url: 7, box }),
        editOf({ kind: 'link', url: 'x'.repeat(10_000), box }),
        editOf({ kind: 'link', url: 'https://example.com/', box: { x: 1 } }),
      ],
      [
        { kind: 'link', url: 'https://example.com/', box },
        undefined,
        undefined,
        undefined,
      ],
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
    assert.deepStrictEqual(
      [
        editOf({
          kind: 'color',
          nodes: ['a'],
          edges: ['ab'],
          color: '#ABCDEF',
        }),
        editOf({ kind: 'color', nodes: [], edges: ['ab'], color: '6' }),
        editOf({ kind: 'color', nodes: ['a'], edges: [], color: '#fA3' }),
        editOf({ kind: 'color', nodes: ['a'], edges: [], color: '#fA' }),
        editOf({ kind: 'color', nodes: ['a'], edges: [] }),
        editOf({ kind: 'order', nodes: ['a'], to: 'back' }),
      ],
      [
        { kind: 'color', nodes: ['a'], edges: ['ab'], color: '#ABCDEF' },
        { kind: 'color', nodes: [], edges: ['ab'], color: '6' },
        { kind: 'color', nodes: ['a'], edges: [], color: '#ffAA33' },
        undefined,
        { kind: 'color', nodes: ['a'], edges: [] },
        { kind: 'order', nodes: ['a'], to: 'back' },
      ],
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
      { kind: 'color', nodes: ['a'], edges: [], color: 'red' },
      { kind: 'color', nodes: ['a'], edges: [], color: '7' },
      { kind: 'color', nodes: ['a'], edges: [], color: '#12345' },
      { kind: 'color', nodes: 'a', edges: [], color: '1' },
      { kind: 'order', nodes: ['a'], to: 'middle' },
      { kind: 'rename' },
      'delete',
    ]) {
      assert.strictEqual(editOf(forged), undefined, JSON.stringify(forged));
    }
  });
});
