import * as assert from 'node:assert';
import { beforeAll, suite, test } from 'vitest';
import { layoutOf, written } from '../../../../../tools/canvas/main/layout';
import { EditedBoard } from '../../../../../tools/canvas/main/edited';
import {
  obsidianCanvasesLoaded,
  type ObsidianCanvases,
} from '../../../../helpers/playgroundCanvases';

const byteOrderMark = String.fromCharCode(0xfeff);

const parsed = (text: string): Record<string, unknown> => {
  const value: unknown = JSON.parse(
    text.startsWith(byteOrderMark) ? text.slice(1) : text,
  );
  assert.ok(
    typeof value === 'object' && value !== null && !Array.isArray(value),
  );
  return { ...value };
};

const again = (text: string) => written(parsed(text), layoutOf(text));

suite('Canvas layout', () => {
  let corpus: ObsidianCanvases;

  beforeAll(async () => {
    corpus = await obsidianCanvasesLoaded();
  });

  test('writes a canvas as Obsidian writes it back byte for byte, a tab an indent and an object a line', () => {
    for (const [name, text] of Object.entries(corpus.obsidianCanvases)) {
      assert.strictEqual(again(text), text, name);
    }
  });

  test('writes a canvas indented by tabs or spaces, on one line, with CRLF, a byte order mark or a last line break back byte for byte', () => {
    const board = {
      nodes: [
        {
          id: 'a',
          type: 'text',
          text: 'é 😀',
          x: 0,
          y: 0,
          width: 1,
          height: 1,
        },
      ],
      edges: [],
      metadata: { by: 'x' },
    };
    for (const text of [
      JSON.stringify(board, null, '\t'),
      JSON.stringify(board, null, 2),
      `${JSON.stringify(board, null, 4)}\n`,
      JSON.stringify(board),
      JSON.stringify(board, null, '\t').replaceAll('\n', '\r\n'),
      `${byteOrderMark}${JSON.stringify(board, null, '\t').replaceAll('\n', '\r\n')}\r\n`,
    ]) {
      assert.strictEqual(again(text), text, JSON.stringify(text.slice(0, 12)));
    }
  });

  test('changes the line of the node moved alone in a canvas as Obsidian writes it, keeping every field of every other node and of the file', () => {
    const text = corpus.everyAttribute;
    const board = new EditedBoard(text);
    const read = board.read();
    assert.ok(read.kind === 'board');
    const [moved] = read.board.nodes.filter((node) => node.type === 'text');
    assert.ok(moved !== undefined);
    board.apply(
      { kind: 'place', boxes: [{ ...moved, x: moved.x + 7 }] },
      () => 'new',
    );
    const before = text.split('\n');
    const after = board.text().split('\n');
    assert.strictEqual(after.length, before.length);
    assert.deepStrictEqual(
      after.flatMap((line, at) => (line === before[at] ? [] : [at])),
      [before.findIndex((line) => line.includes(moved.id))],
    );
  });

  test('writes a canvas made in an empty file as Obsidian writes a new one', () => {
    const board = new EditedBoard('');
    board.apply(
      {
        kind: 'add',
        node: { type: 'text', x: 0, y: 0, width: 140, height: 54 },
      },
      () => 'abc',
    );
    assert.strictEqual(
      board.text(),
      '{\n\t"nodes":[\n\t\t{"id":"abc","type":"text","text":"","x":0,"y":0,"width":140,"height":54}\n\t],\n\t"edges":[]\n}',
    );
  });
});
