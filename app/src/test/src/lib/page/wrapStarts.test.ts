import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { wrapStarts } from '../../../../lib/page/wordWrap';
import { cellWidthsOf } from '../../../../lib/page/textWidths';
import { plainCells } from '../../../../lib/page/cellTable';
import { keptWrapStarts } from '../../../../lib/page/wrapStarts';

const words = (count: number, word = 'word') =>
  Array.from({ length: count }, (_, index) => `${word}${index}`).join(' ');

suite('Kept wrap starts', () => {
  test('keeps where a line wraps for its columns and indentation, working it out once however often the line is drawn, the widths of characters left out of a line of ASCII alone, for the 16 lines drawn last, as working out the rows of a line of a megabyte again each time it scrolled into view stalled the diff', () => {
    const long = words(12_000);
    const starts = keptWrapStarts(long, 80, 0, undefined);
    assert.deepStrictEqual(starts, wrapStarts(long, 80, 0));
    assert.strictEqual(keptWrapStarts(long, 80, 0, undefined), starts);
    const widths = cellWidthsOf(plainCells);
    assert.strictEqual(keptWrapStarts(long, 80, 0, widths), starts);
    assert.notStrictEqual(keptWrapStarts(long, 81, 0, undefined), starts);
    assert.notStrictEqual(keptWrapStarts(long, 80, 2, undefined), starts);
    for (let other = 0; other < 13; other++) {
      keptWrapStarts(words(10, `other${other}-`), 80, 0, undefined);
    }
    assert.strictEqual(keptWrapStarts(long, 80, 0, undefined), starts);
    for (let other = 0; other < 16; other++) {
      keptWrapStarts(words(10, `more${other}-`), 80, 0, undefined);
    }
    const again = keptWrapStarts(long, 80, 0, undefined);
    assert.notStrictEqual(again, starts);
    assert.deepStrictEqual(again, starts);
  });
});
