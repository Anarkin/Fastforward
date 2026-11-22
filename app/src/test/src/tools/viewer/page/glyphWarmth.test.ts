import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { packedPart } from '../../../../../components/syntax/page/parts';
import { CellFrame } from '../../../../../tools/viewer/page/cellFrame';
import {
  cellPainting,
  paintRows,
  type RowsLook,
} from '../../../../../tools/viewer/page/cellPainting';
import {
  asciiJob,
  linesJob,
  rowsJob,
} from '../../../../../tools/viewer/page/glyphWarmth';
import type { IdleJob } from '../../../../../tools/viewer/page/idleWork';
import type { ScreenRow } from '../../../../../tools/viewer/page/screenRows';
import {
  paletteOf,
  textStyles,
} from '../../../../../tools/viewer/page/textCells';
import {
  coloredText,
  withPart,
} from '../../../../../tools/viewer/page/textColors';
import { fakePainter, look, tilesWith, widths } from './cellFixtures';

const dot = { size: 2, left: 2, top: 7, hairline: 1 };

function warming(size = 4096, now: () => number = () => 0) {
  const painter = fakePainter();
  const tiles = tilesWith(painter, size, now);
  const painting = cellPainting(tiles, new CellFrame(), paletteOf(look), dot);
  return { painter, tiles, painting };
}

const rowsLook: RowsLook = {
  wrapAt: undefined,
  colored: undefined,
  marksOf: () => [],
  showWhitespace: false,
  widths,
  first: 0,
};

function rowOf(text: string, start: number): ScreenRow {
  return {
    start,
    end: start + text.length + 1,
    row: { start, end: start + text.length + 1, text },
    index: 0,
    from: 0,
    to: text.length,
    indent: 0,
    breakAt: undefined,
    hanging: [],
  };
}

function finished(job: IdleJob, most = 10_000): number {
  let steps = 1;
  while (!job() && steps < most) {
    steps++;
  }
  return steps;
}

suite('Glyphs drawn before they are needed', () => {
  test('draws every letter, digit and sign of ASCII in the color of plain text and of each kind of code, a glyph a step, so code opened later finds them drawn', () => {
    const { painter, tiles, painting } = warming();
    const styles = textStyles({ tiles, palette: painting.palette });

    const steps = finished(asciiJob(tiles, styles));

    assert.deepStrictEqual(
      [...new Set(painter.painted.map(({ ink }) => ink))],
      ['plain', 'blue', 'orange'],
    );
    assert.deepStrictEqual(
      [painter.painted.length, steps],
      [3 * 94, 3 * 94 + 1],
    );
    assert.deepStrictEqual(
      [painter.painted[0].shown, painter.painted[93].shown],
      ['!', '~'],
    );
  });

  test('draws no letter drawn already, and gives up for good once the atlas is full, and for now once the time of the slice is up', () => {
    const drawnBefore = warming();
    const style = drawnBefore.tiles.style('plain', look.ground);
    drawnBefore.tiles.ascii(style, 33);
    finished(asciiJob(drawnBefore.tiles, [style]));

    const full = warming(30);
    const fullJob = asciiJob(full.tiles, [
      full.tiles.style('plain', look.ground),
    ]);

    let now = 0;
    const hurried = warming(4096, () => now);
    hurried.tiles.within(2);
    now = 3;
    const hurriedJob = asciiJob(hurried.tiles, [
      hurried.tiles.style('plain', look.ground),
    ]);

    assert.strictEqual(drawnBefore.painter.painted.length, 94);
    assert.deepStrictEqual(
      [fullJob(), fullJob(), fullJob()],
      [false, false, true],
    );
    assert.strictEqual(hurriedJob(), false);
  });

  test('works out the rows read around the screen a row a step, so a row scrolled to is drawn from the cells kept of it, its glyphs in the atlas', () => {
    const { painter, painting } = warming();
    const ahead = [rowOf('ab', 0), rowOf('中', 3)].map((row) => ({
      row,
      part: undefined,
    }));

    const steps = finished(rowsJob(painting, rowsLook, ahead));
    const drawnAhead = painter.painted.length;
    paintRows(
      painting,
      { ...rowsLook, rows: ahead.map(({ row }) => row), parts: [] },
      Infinity,
    );

    assert.deepStrictEqual([steps, drawnAhead], [2, 3]);
    assert.deepStrictEqual(
      [painter.painted.length, painting.kept.size],
      [3, 2],
    );
  });

  test('stays at a row whose glyphs the slice had no time for, and works out no more rows once half the atlas is taken, leaving the rest to what is shown', () => {
    let now = 0;
    const hurried = warming(4096, () => now);
    hurried.tiles.within(2);
    now = 3;
    const hurriedJob = rowsJob(hurried.painting, rowsLook, [
      { row: rowOf('ab', 0), part: undefined },
    ]);
    const stuck = hurriedJob();
    hurried.tiles.within(Infinity);

    const taken = warming(60);
    for (let code = 33; code < 39; code++) {
      taken.tiles.ascii(taken.tiles.style('plain', look.ground), code);
    }
    const takenJob = rowsJob(taken.painting, rowsLook, [
      { row: rowOf('xyz', 0), part: undefined },
    ]);

    assert.deepStrictEqual([stuck, hurriedJob()], [false, true]);
    assert.deepStrictEqual([takenJob(), taken.painting.kept.size], [true, 0]);
  });

  test('draws the characters past ASCII of a whole text, each line that has one in a step and the lines without in passing, in the color the text is drawn in', () => {
    const { painter, painting } = warming();

    const steps = finished(
      linesJob(painting, rowsLook, 'plain\n中文 and 中\nmore\n한'),
    );

    assert.deepStrictEqual(
      painter.painted
        .filter(({ shown }) => shown.charCodeAt(0) > 127)
        .map(({ shown, ink }) => [shown, ink]),
      [
        ['中', 'plain'],
        ['文', 'plain'],
        ['한', 'plain'],
      ],
    );
    assert.strictEqual(steps, 3);
  });

  test('draws the characters of code in the colors of its tokens', () => {
    const { painter, painting } = warming();
    const text = "x = '中'\n";
    const colored = withPart(
      coloredText(text, 'utf-8', false),
      packedPart([[{ start: 4, end: 7, kind: 'string' }], []], 0, true),
    );

    finished(linesJob(painting, { ...rowsLook, colored }, text));

    assert.deepStrictEqual(
      painter.painted
        .filter(({ shown }) => shown === '中')
        .map(({ ink }) => ink),
      ['orange'],
    );
  });
});
