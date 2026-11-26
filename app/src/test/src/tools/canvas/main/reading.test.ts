import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { boardOf } from '../../../../../tools/canvas/main/reading';

const placed = { x: 0, y: 0, width: 250, height: 60 };

suite('Canvas reading', () => {
  test('reads the nodes of each kind and the edges of JSON Canvas, what each holds and in the order of the file, the first drawn lowest', () => {
    const json = JSON.stringify({
      nodes: [
        {
          id: 'g',
          type: 'group',
          x: -40,
          y: -40,
          width: 600,
          height: 400,
          label: 'Plan',
          background: 'cork.png',
          backgroundStyle: 'repeat',
        },
        {
          id: 't',
          type: 'text',
          x: 0,
          y: 0,
          width: 250,
          height: 60,
          text: '# Idea',
          color: '1',
        },
        {
          id: 'f',
          type: 'file',
          x: 300,
          y: 0,
          width: 250,
          height: 60,
          file: 'notes/a.md',
          subpath: '#Top',
        },
        {
          id: 'l',
          type: 'link',
          x: 0,
          y: 100,
          width: 250,
          height: 60,
          url: 'https://jsoncanvas.org',
          color: '#ff0000',
        },
      ],
      edges: [
        {
          id: 'e',
          fromNode: 't',
          fromSide: 'right',
          fromEnd: 'none',
          toNode: 'f',
          toSide: 'left',
          toEnd: 'arrow',
          color: '4',
          label: 'leads to',
        },
        { id: 'e2', fromNode: 'f', toNode: 'l' },
      ],
    });
    assert.deepStrictEqual(boardOf(json), {
      kind: 'board',
      board: {
        nodes: [
          {
            id: 'g',
            type: 'group',
            x: -40,
            y: -40,
            width: 600,
            height: 400,
            label: 'Plan',
            background: 'cork.png',
            backgroundStyle: 'repeat',
          },
          {
            id: 't',
            type: 'text',
            x: 0,
            y: 0,
            width: 250,
            height: 60,
            text: '# Idea',
            color: '1',
          },
          {
            id: 'f',
            type: 'file',
            x: 300,
            y: 0,
            width: 250,
            height: 60,
            file: 'notes/a.md',
            subpath: '#Top',
          },
          {
            id: 'l',
            type: 'link',
            x: 0,
            y: 100,
            width: 250,
            height: 60,
            url: 'https://jsoncanvas.org',
            color: '#ff0000',
          },
        ],
        edges: [
          {
            id: 'e',
            fromNode: 't',
            fromSide: 'right',
            fromEnd: 'none',
            toNode: 'f',
            toSide: 'left',
            toEnd: 'arrow',
            color: '4',
            label: 'leads to',
          },
          { id: 'e2', fromNode: 'f', toNode: 'l' },
        ],
      },
      skipped: 0,
    });
  });

  test('reads an empty file, one of blanks, an object without nodes or edges and a byte order mark before the JSON as a canvas with nothing on it, as Obsidian writes a new canvas empty', () => {
    const empty = {
      kind: 'board',
      board: { nodes: [], edges: [] },
      skipped: 0,
    };
    for (const text of ['', ' \r\n', '{}', '﻿{"nodes":[],"edges":[]}']) {
      assert.deepStrictEqual(boardOf(text), empty, JSON.stringify(text));
    }
  });

  test('tells text that is no JSON from JSON that holds no canvas, an array, a value alone or nodes and edges that are no lists', () => {
    assert.deepStrictEqual(boardOf('{"nodes": ['), { kind: 'notJson' });
    for (const text of [
      '[]',
      '3',
      'null',
      '"text"',
      '{"nodes":{}}',
      '{"edges":3}',
    ]) {
      assert.deepStrictEqual(boardOf(text), { kind: 'notBoard' }, text);
    }
  });

  test('skips a node without an id, a place and size in numbers or what its kind holds, or of a kind JSON Canvas lacks, one whose id an earlier node has, and an edge to a node not drawn, counting them, but keeps a node of no width, as JSON Canvas asks for whole numbers alone', () => {
    const read = boardOf(
      JSON.stringify({
        nodes: [
          { id: 'a', type: 'text', ...placed, text: 'kept' },
          { type: 'text', ...placed, text: 'no id' },
          {
            id: 'b',
            type: 'text',
            x: 0,
            y: 0,
            width: 0,
            height: 60,
            text: 'flat',
          },
          {
            id: 'c',
            type: 'text',
            x: '0',
            y: 0,
            width: 10,
            height: 10,
            text: 'text place',
          },
          { id: 'd', type: 'text', ...placed },
          { id: 'e', type: 'file', ...placed },
          { id: 'f', type: 'link', ...placed },
          { id: 'g', type: 'sticker', ...placed },
          { id: 'a', type: 'text', ...placed, text: 'second a' },
          'node',
        ],
        edges: [
          { id: 'x', fromNode: 'a', toNode: 'a' },
          { id: 'y', fromNode: 'a', toNode: 'b' },
          { id: 'z', fromNode: 'a' },
          { id: 'x', fromNode: 'a', toNode: 'a' },
        ],
      }),
    );
    assert.deepStrictEqual(read, {
      kind: 'board',
      board: {
        nodes: [
          { id: 'a', type: 'text', ...placed, text: 'kept' },
          {
            id: 'b',
            type: 'text',
            x: 0,
            y: 0,
            width: 0,
            height: 60,
            text: 'flat',
          },
        ],
        edges: [
          { id: 'x', fromNode: 'a', toNode: 'a' },
          { id: 'y', fromNode: 'a', toNode: 'b' },
        ],
      },
      skipped: 10,
    });
  });

  test('leaves out a side or an end JSON Canvas lacks, and a color or a label that is no text, keeping the node or the edge', () => {
    assert.deepStrictEqual(
      boardOf(
        JSON.stringify({
          nodes: [{ id: 'a', type: 'group', ...placed, label: 3, color: 2 }],
          edges: [
            {
              id: 'e',
              fromNode: 'a',
              fromSide: 'middle',
              fromEnd: 'dot',
              toNode: 'a',
              toSide: null,
              label: true,
              color: 4,
            },
          ],
        }),
      ),
      {
        kind: 'board',
        board: {
          nodes: [{ id: 'a', type: 'group', ...placed }],
          edges: [{ id: 'e', fromNode: 'a', toNode: 'a' }],
        },
        skipped: 0,
      },
    );
  });
});
