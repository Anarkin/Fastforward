import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { notDrawn } from '../../../../../tools/viewer/page/glyphTiles';
import {
  fakePainter,
  metrics,
  padX,
  tileHeight,
  tilesWith,
} from './cellFixtures';

const ground = [17, 17, 17, 1] as const;

const narrow = { cells: 1, centered: false, scale: 1 };

const wide = { cells: 2, centered: true, scale: 1 };

suite('Tiles of the glyphs drawn', () => {
  test('draws a glyph of a style once and finds it again, a letter by its code and any other by its cluster', () => {
    const painter = fakePainter();
    const tiles = tilesWith(painter);
    const style = tiles.style('plain', ground);

    const letter = tiles.ascii(style, 97);
    const other = tiles.glyph(style, '中', '中', wide);

    assert.strictEqual(tiles.ascii(style, 97), letter);
    assert.strictEqual(tiles.known(style, '中'), other);
    assert.strictEqual(tiles.known(style, '文'), undefined);
    assert.deepStrictEqual(
      painter.painted.map(({ shown }) => shown),
      ['a', '中'],
    );
  });

  test('knows a style by its ink and its ground, drawing the glyphs of each apart', () => {
    const painter = fakePainter();
    const tiles = tilesWith(painter);
    const plain = tiles.style('plain', ground);
    const marked = tiles.style('plain', [255, 204, 0, 1]);

    assert.strictEqual(tiles.style('plain', ground), plain);
    assert.notStrictEqual(tiles.ascii(plain, 97), tiles.ascii(marked, 97));
    assert.deepStrictEqual(
      painter.painted.map(({ ground: under }) => under),
      ['rgb(17 17 17)', 'rgb(255 204 0)'],
    );
  });

  test('gives a tile the cells of its glyph and half a cell on either side, the next tile standing right after it, and a glyph of no cell the room of one', () => {
    const painter = fakePainter();
    const tiles = tilesWith(painter);
    const style = tiles.style('plain', ground);

    const letter = tiles.ascii(style, 97);
    const han = tiles.glyph(style, '中', '中', wide);
    const mark = tiles.glyph(style, '́', '́', { ...narrow, cells: 0 });

    assert.deepStrictEqual(
      [letter, han, mark].map((tile) => [
        tiles.us[tile],
        tiles.vs[tile],
        tiles.widths[tile],
        tiles.cells[tile],
      ]),
      [
        [0, 0, metrics.advance + 2 * padX, 1],
        [15, 0, 2 * metrics.advance + 2 * padX, 2],
        [37, 0, metrics.advance + 2 * padX, 0],
      ],
    );
  });

  test('goes on in the next shelf once one is full, handing the full one to the texture first, and the one it is in before a frame is drawn', () => {
    const painter = fakePainter();
    const tiles = tilesWith(painter, 50);
    const style = tiles.style('plain', ground);

    const drawn = [97, 98, 99, 100].map((code) => tiles.ascii(style, code));
    tiles.flush();
    tiles.flush();

    assert.deepStrictEqual(
      drawn.map((tile) => [tiles.us[tile], tiles.vs[tile]]),
      [
        [0, 0],
        [15, 0],
        [30, 0],
        [0, tileHeight],
      ],
    );
    assert.deepStrictEqual(painter.uploaded, [0, tileHeight]);
  });

  test('draws no glyph once the atlas is full, saying so, and starts over when reset, every tile handed out before then stale', () => {
    const painter = fakePainter();
    const tiles = tilesWith(painter, 30);
    const style = tiles.style('plain', ground);
    const fitting = [tiles.ascii(style, 97), tiles.ascii(style, 98)];

    const third = tiles.ascii(style, 99);

    assert.deepStrictEqual(
      [fitting, third, tiles.full],
      [[0, 1], notDrawn, true],
    );

    tiles.reset();

    assert.deepStrictEqual(
      [tiles.full, tiles.generation, tiles.count, tiles.ascii(style, 99)],
      [false, 1, 0, 0],
    );
  });

  test('draws no new glyph past the time a frame has for them, leaving it to the next frame, while those drawn before are still found', () => {
    const painter = fakePainter();
    let now = 0;
    const tiles = tilesWith(painter, 4096, () => now);
    const style = tiles.style('plain', ground);
    tiles.within(2);
    const letter = tiles.ascii(style, 97);
    now = 3;

    assert.strictEqual(tiles.ascii(style, 98), notDrawn);
    assert.strictEqual(tiles.ascii(style, 97), letter);

    tiles.within(2);

    assert.strictEqual(tiles.ascii(style, 98), 1);
  });

  test('keeps the glyphs of one look while those of another are drawn, each ink on each ground a style of its own, as the views of a window share the tiles and a theme switched back to finds its glyphs there', () => {
    const painter = fakePainter();
    const tiles = tilesWith(painter);
    const style = tiles.style('plain', ground);
    const letter = tiles.ascii(style, 97);

    const other = tiles.style('plain', [255, 255, 255, 1]);
    const lettered = tiles.ascii(other, 97);

    assert.notStrictEqual(other, style);
    assert.notStrictEqual(lettered, letter);
    assert.deepStrictEqual(
      [
        tiles.style('plain', ground),
        tiles.ascii(tiles.style('plain', ground), 97),
        tiles.count,
        tiles.generation,
      ],
      [style, letter, 2, 0],
    );
  });
});
