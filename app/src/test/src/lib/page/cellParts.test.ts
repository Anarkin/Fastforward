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

  test('cuts a text into its characters only around those beyond ASCII, asking the width of each such character whole, with the letter of ASCII its marks join or its sign comes before, as cutting a whole line of 150 characters for the three of them beyond ASCII took a quarter of the script of a diff scrolled', () => {
    const asked: string[] = [];
    const boxing = {
      char: 10,
      of: () => 10,
      boxed: (cluster: string) => {
        asked.push(cluster);
        return /[中😀]|⃣|؀/u.test(cluster) ? 2 : undefined;
      },
    };
    const whole = (text: string) => {
      const parts: { text: string; cells?: number; scale?: undefined }[] = [];
      let plain = '';
      for (const { segment } of new Intl.Segmenter(undefined, {
        granularity: 'grapheme',
      }).segment(text)) {
        const cells = /[^\0-\x7f]/.test(segment)
          ? boxing.boxed(segment)
          : undefined;
        if (cells === undefined) {
          plain += segment;
        } else {
          if (plain !== '') {
            parts.push({ text: plain });
            plain = '';
          }
          parts.push({ text: segment, cells, scale: undefined });
        }
      }
      return plain === '' ? parts : [...parts, { text: plain }];
    };
    for (const text of [
      'plain ascii é and é here',
      'a中b😀c',
      '1️⃣ keycap and 2 after',
      '؀1 a sign before its digit, x́؀y between',
      '👨‍👩‍👧‍👦 family, 🇭🇺 flag, 한글',
      'ends with é',
      'é',
      'line\r\ń mark after a break',
      `${'x'.repeat(200)}č${'y'.repeat(200)}Ĥ${'z'.repeat(200)}`,
    ]) {
      const expected = whole(text);
      asked.length = 0;
      assert.deepStrictEqual(cellParts(text, boxing), expected, text);
    }
    asked.length = 0;
    cellParts(`${'x'.repeat(200)}č${'y'.repeat(200)}`, boxing);
    assert.deepStrictEqual(asked, ['č']);
  });
});
