import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { wrapStarts } from '../../../../lib/page/wordWrap';
import { cellWidthsOf } from '../../../../lib/page/textWidths';
import { plainCells } from '../../../../lib/page/cellTable';
import { keptWrapStarts } from '../../../../lib/page/wrapStarts';

const words = (count: number, word = 'word') =>
  Array.from({ length: count }, (_, index) => `${word}${index}`).join(' ');

suite('Kept wrap starts', () => {
  test('keeps where a line wraps for its columns and indentation, working it out once however often the line is drawn, the widths of characters left out of a line of ASCII alone, for the lines drawn last that are a million characters together, as working out the rows of a line of a megabyte again each time it scrolled into view stalled the diff', () => {
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
    for (let other = 0; other < 10; other++) {
      keptWrapStarts(words(12_000, `more${other}-`), 80, 0, undefined);
    }
    const again = keptWrapStarts(long, 80, 0, undefined);
    assert.notStrictEqual(again, starts);
    assert.deepStrictEqual(again, starts);
  });

  test('keeps as many lines as a view of long lines draws, as only the 16 drawn last were kept and a table of a hundred long lines had the rows of each worked out again at every scroll of the editor, which stalled for 25 ms', () => {
    const lines = Array.from({ length: 300 }, (_, line) =>
      words(150, `cell${line}-`),
    );
    const first = lines.map((line) => keptWrapStarts(line, 80, 2, undefined));
    const again = lines.map((line) => keptWrapStarts(line, 80, 2, undefined));

    assert.ok(again.every((starts, line) => starts === first[line]));
  });
});
