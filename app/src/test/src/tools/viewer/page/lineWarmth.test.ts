import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { CellFrame } from '../../../../../components/cells/page/cellFrame';
import {
  cellPainting,
  type RowsLook,
} from '../../../../../components/cells/page/cellPainting';
import type { IdleJob } from '../../../../../components/cells/page/idleWork';
import { paletteOf } from '../../../../../components/cells/page/textCells';
import { packedPart } from '../../../../../components/syntax/page/parts';
import { linesJob } from '../../../../../tools/viewer/page/lineWarmth';
import {
  coloredText,
  withPart,
} from '../../../../../tools/viewer/page/textColors';
import {
  fakePainter,
  look,
  tilesWith,
  widths,
} from '../../../components/cells/page/cellFixtures';

const dot = { size: 2, left: 2, top: 7, hairline: 1, gap: 2 };

function warming() {
  const painter = fakePainter();
  const tiles = tilesWith(painter);
  const painting = cellPainting(tiles, new CellFrame(), paletteOf(look), dot);
  return { painter, tiles, painting };
}

const rowsLook: RowsLook = {
  wrapAt: undefined,
  segmentsOf: undefined,
  marksOf: () => [],
  showWhitespace: false,
  widths,
  first: 0,
};

function finished(job: IdleJob, most = 10_000): number {
  let steps = 1;
  while (!job() && steps < most) {
    steps++;
  }
  return steps;
}

suite('Glyphs of a whole file drawn before they are needed', () => {
  test('draws the characters past ASCII of a whole text, each line that has one in a step and the lines without in passing, in the color the text is drawn in', () => {
    const { painter, painting } = warming();

    const steps = finished(
      linesJob(painting, rowsLook, 'plain\n中文 and 中\nmore\n한', undefined),
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

    finished(linesJob(painting, rowsLook, text, colored));

    assert.deepStrictEqual(
      painter.painted
        .filter(({ shown }) => shown === '中')
        .map(({ ink }) => ink),
      ['orange'],
    );
  });
});
