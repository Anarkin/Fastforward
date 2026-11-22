import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { plainCells } from '../../../../lib/page/cellTable';
import { columnsOf } from '../../../../lib/page/textColumns';
import { cellWidthsOf } from '../../../../lib/page/textWidths';
import type { TextWidths } from '../../../../lib/page/textWidths';

suite('Columns of a text', () => {
  test('counts a control character one column, as its picture is drawn, a tab to its stop and a wide character two', () => {
    const wide: TextWidths = {
      char: 1,
      of: (cluster) => (cluster === '中' ? 2 : plainCells(cluster)),
    };
    const column = columnsOf('a\u0001\u001b\tb中\u007fc', wide);
    assert.deepStrictEqual(
      [0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => column(index)),
      [0, 1, 2, 3, 4, 5, 7, 8, 9],
    );
    assert.strictEqual(
      columnsOf('\u0001\u0002\u0003', cellWidthsOf(plainCells))(3),
      3,
    );
    assert.strictEqual(columnsOf('\u0001\u0002\u0003', undefined)(3), 3);
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
    assert.strictEqual(columnsOf('a\u0001b\u001bé\u007f', counting)(6), 6);
    assert.deepStrictEqual(asked, ['é']);
  });
});
