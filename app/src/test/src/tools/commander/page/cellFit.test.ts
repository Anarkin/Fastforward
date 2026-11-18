import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  cutClass,
  fitsColumn,
} from '../../../../../tools/commander/page/cellFit';

suite('Commander cells that fit their column', () => {
  test('knows a text fits a column as wide as its characters or wider, each of them a character of the monospace font, and takes one with any other character, wide or joined, for one that may not, so a cell is clipped only where its text may reach past its column, as clipping every cell of every row had each frame of a scroll paint a thousand clips', () => {
    assert.deepStrictEqual(
      [
        fitsColumn('txt', 5),
        fitsColumn('12,288', 6),
        fitsColumn('', 0),
        fitsColumn('2026-11-18 14:05', 16),
        fitsColumn('appinstaller', 5),
        fitsColumn('12,288', 5),
        fitsColumn('日本', 5),
        fitsColumn(`a${String.fromCharCode(0x202f)}m`, 5),
        fitsColumn('a\tb', 5),
      ],
      [true, true, true, true, false, false, false, false, false],
    );
  });

  test('names the cells to cut where they end by a class of their own, and leaves the others without', () => {
    assert.deepStrictEqual(
      [cutClass('txt', 5), cutClass('appinstaller', 5)],
      ['', ' cut'],
    );
  });
});
