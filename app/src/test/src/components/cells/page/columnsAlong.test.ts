import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { plainCells } from '../../../../../lib/page/cellTable';
import { columnsAlong } from '../../../../../components/cells/page/columns';
import { cellWidthsOf } from '../../../../../lib/page/textWidths';
import type { TextWidths } from '../../../../../lib/page/textWidths';

suite('Columns along a text', () => {
  test('counts a control character one column, as its picture is drawn, a tab to its stop and a wide character two', () => {
    const wide: TextWidths = {
      char: 1,
      of: (cluster) => (cluster === '中' ? 2 : plainCells(cluster)),
    };
    const column = columnsAlong('a\u0001\u001b\tb中\u007fc', wide);
    assert.deepStrictEqual(
      [0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => column(index)),
      [0, 1, 2, 3, 4, 5, 7, 8, 9],
    );
    assert.strictEqual(
      columnsAlong('\u0001\u0002\u0003', cellWidthsOf(plainCells))(3),
      3,
    );
    assert.strictEqual(columnsAlong('\u0001\u0002\u0003', undefined)(3), 3);
  });

  test('asks the widths of no control character, as each asked meant finding its place among the characters of the line anew, a line of them slowing every row drawn', () => {
    const asked: string[] = [];
    const counting: TextWidths = {
      char: 1,
      of: (cluster) => {
        asked.push(cluster);
        return 1;
      },
    };
    assert.strictEqual(columnsAlong('a\u0001b\u001bé\u007f', counting)(6), 6);
    assert.deepStrictEqual(asked, ['é']);
  });

  test('asks the widths of no letter of ASCII before an emoji, which joins nothing to it, but of one an accent joins, as they are drawn as one', () => {
    const asked: string[] = [];
    const counting: TextWidths = {
      char: 1,
      of: (cluster) => {
        asked.push(cluster);
        return 2;
      },
    };
    const pig = String.fromCodePoint(0x1f437);
    const accented = 'e\u0301';
    assert.strictEqual(columnsAlong(` ${pig}`, counting)(3), 3);
    assert.strictEqual(columnsAlong(`${accented}b`, counting)(2), 2);
    assert.deepStrictEqual(asked, [pig, accented]);
  });
});
