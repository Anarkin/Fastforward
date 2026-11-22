import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { CellFrame } from '../../../../../tools/viewer/page/cellFrame';
import { rectsIn, tilesIn } from './cellFixtures';

suite('Cells of a frame', () => {
  test('keeps where each tile stands, where its glyph is in the atlas and the ground under it', () => {
    const frame = new CellFrame();
    frame.tile(-4, 12, 30, 48, 15, 24, 0xff111111);
    frame.tile(3, 12, 45, 48, 22, 24, 0xff00ccff);

    assert.deepStrictEqual(tilesIn(frame), [
      { x: -4, y: 12, u: 30, v: 48, width: 15, height: 24, ground: 0xff111111 },
      { x: 3, y: 12, u: 45, v: 48, width: 22, height: 24, ground: 0xff00ccff },
    ]);
  });

  test('keeps each rectangle with its color', () => {
    const frame = new CellFrame();
    frame.rect(2, 7, 2, 2, 0xff6d6d6d);

    assert.deepStrictEqual(rectsIn(frame), [
      { x: 2, y: 7, width: 2, height: 2, color: 0xff6d6d6d },
    ]);
  });

  test('lays a rectangle again where it was put, so one put before what it lies under takes its size once that is drawn, and stays under what was put after it', () => {
    const frame = new CellFrame();
    const under = frame.rect(0, 0, 0, 0, 0);
    frame.rect(9, 7, 2, 2, 0xff6d6d6d);

    frame.rectAt(under, 0, 0, 21, 16, 0xff784f26);

    assert.deepStrictEqual(rectsIn(frame), [
      { x: 0, y: 0, width: 21, height: 16, color: 0xff784f26 },
      { x: 9, y: 7, width: 2, height: 2, color: 0xff6d6d6d },
    ]);
  });

  test('takes more tiles and rectangles than it first has room for, losing none', () => {
    const frame = new CellFrame();
    for (let at = 0; at < 20_000; at++) {
      frame.tile(at % 3000, 0, at % 4000, 0, 15, 24, at);
      frame.rect(at % 3000, 1, 2, 2, at);
    }

    assert.strictEqual(frame.tileCount, 20_000);
    assert.deepStrictEqual(tilesIn(frame)[19_999], {
      x: 19_999 % 3000,
      y: 0,
      u: 19_999 % 4000,
      v: 0,
      width: 15,
      height: 24,
      ground: 19_999,
    });
    assert.deepStrictEqual(rectsIn(frame)[19_999], {
      x: 19_999 % 3000,
      y: 1,
      width: 2,
      height: 2,
      color: 19_999,
    });
  });

  test('hands back the cells of a row and takes them again moved, so a row drawn once is not worked out anew where it stands next', () => {
    const frame = new CellFrame();
    frame.tile(0, 0, 0, 0, 15, 24, 1);
    frame.tile(10, 32, 15, 0, 15, 24, 2);
    frame.rect(12, 39, 2, 2, 3);
    const row = frame.kept(1, 0);
    frame.reset();
    frame.tile(0, 0, 0, 0, 15, 24, 1);

    frame.append(row, -7, 16);

    assert.deepStrictEqual(
      tilesIn(frame).map(({ x, y, u, ground }) => [x, y, u, ground]),
      [
        [0, 0, 0, 1],
        [3, 48, 15, 2],
      ],
    );
    assert.deepStrictEqual(rectsIn(frame), [
      { x: 5, y: 55, width: 2, height: 2, color: 3 },
    ]);
  });

  test('starts every frame empty, with no glyph missing', () => {
    const frame = new CellFrame();
    frame.tile(0, 0, 0, 0, 15, 24, 1);
    frame.rect(0, 0, 1, 1, 1);
    frame.missing = 2;

    frame.reset();

    assert.deepStrictEqual(
      [frame.tileCount, frame.rectCount, frame.missing],
      [0, 0, 0],
    );
  });
});
