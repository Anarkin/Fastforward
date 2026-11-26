import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { boardOf } from '../../../../../tools/canvas/main/reading';
import {
  everyAttribute,
  obsidianCanvases,
  unicodeAndPlaces,
} from './obsidianCanvases';

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;

function idsIn(text: string, list: 'nodes' | 'edges'): string[] {
  const parsed: unknown = JSON.parse(text);
  const items = isRecord(parsed) ? parsed[list] : undefined;
  return Array.isArray(items)
    ? items.flatMap((item: unknown) =>
        isRecord(item) && typeof item.id === 'string' ? [item.id] : [],
      )
    : [];
}

const read = (text: string) => {
  const found = boardOf(text);
  assert.ok(found.kind === 'board', found.kind);
  return found;
};

suite('JSON Canvas 1.0', () => {
  test('reads every node and edge of a canvas as Obsidian writes it, a tab an indent and an object a line, leaving out none', () => {
    for (const [name, text] of Object.entries(obsidianCanvases)) {
      const { board, skipped } = read(text);
      assert.strictEqual(skipped, 0, name);
      assert.deepStrictEqual(
        board.nodes.map((node) => node.id),
        idsIn(text, 'nodes'),
        name,
      );
      assert.deepStrictEqual(
        board.edges.map((edge) => edge.id),
        idsIn(text, 'edges'),
        name,
      );
    }
  });

  test('keeps every attribute JSON Canvas defines as written: the place, size and color of every node, the text of a text, the file and subpath of a file, the url of a link, the label and background of a group, and the sides, ends, color and label of an edge', () => {
    const { board } = read(everyAttribute);
    const written: unknown = JSON.parse(everyAttribute);
    assert.deepStrictEqual(board, written);
  });

  test('keeps the nodes in the order of the file, the first lowest, a group listed after the nodes it holds too', () => {
    assert.deepStrictEqual(
      read(unicodeAndPlaces).board.nodes.map((node) => node.type),
      ['text', 'text', 'text', 'group'],
    );
  });

  test('reads a canvas with nodes and no edges, or edges and no nodes, as both lists are optional', () => {
    assert.deepStrictEqual(
      read(
        '{"nodes":[{"id":"a","type":"text","text":"","x":0,"y":0,"width":1,"height":1}]}',
      ).board.edges,
      [],
    );
    assert.deepStrictEqual(read('{"edges":[]}').board, {
      nodes: [],
      edges: [],
    });
  });

  test('leaves the ends of an edge unset where the file leaves them, for the canvas to draw none at its start and an arrow at its end as JSON Canvas defaults them', () => {
    const [edge] = read(obsidianCanvases.sampleLike ?? '').board.edges;
    assert.strictEqual(edge?.fromEnd, undefined);
    assert.strictEqual(edge?.toEnd, undefined);
  });

  test('reads a node of fields JSON Canvas lacks, as a plugin of Obsidian adds them, and an edge with them too', () => {
    const { board, skipped } = read(
      JSON.stringify({
        nodes: [
          {
            id: 'a',
            type: 'text',
            text: 'x',
            x: 0,
            y: 0,
            width: 250,
            height: 60,
            styleAttributes: { shape: 'pill' },
            zIndex: 3,
          },
        ],
        edges: [
          {
            id: 'e',
            fromNode: 'a',
            toNode: 'a',
            styleAttributes: { path: 'dotted' },
          },
        ],
        metadata: { version: '1.0-1.0' },
      }),
    );
    assert.strictEqual(skipped, 0);
    assert.deepStrictEqual(board.nodes[0], {
      id: 'a',
      type: 'text',
      text: 'x',
      x: 0,
      y: 0,
      width: 250,
      height: 60,
    });
    assert.deepStrictEqual(board.edges, [
      { id: 'e', fromNode: 'a', toNode: 'a' },
    ]);
  });
});
