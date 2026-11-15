import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { cellParts } from '../../../../lib/page/cellParts';

suite('Widths of text in columns', () => {
  test('splits text into the runs left as they are and the characters put in boxes, with the size a glyph wider than its box is shrunk to', () => {
    const widths = {
      char: 10,
      of: () => 20,
      boxed: (cluster: string) => (/[😀中]/u.test(cluster) ? 2 : undefined),
      scaled: (cluster: string) => (cluster === '😀' ? 0.875 : undefined),
    };
    assert.deepStrictEqual(cellParts('ab😀c中', widths), [
      { text: 'ab' },
      { text: '😀', cells: 2, scale: 0.875 },
      { text: 'c' },
      { text: '中', cells: 2, scale: undefined },
    ]);
    assert.deepStrictEqual(cellParts('plain', widths), [{ text: 'plain' }]);
    assert.deepStrictEqual(cellParts('😀', { char: 10, of: () => 20 }), [
      { text: '😀' },
    ]);
  });
});
