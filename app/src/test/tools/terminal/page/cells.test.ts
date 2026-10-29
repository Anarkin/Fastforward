import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  letterSpacingFor,
  lineHeightFor,
} from '../../../../tools/terminal/page/theme';

function xtermRow(lineHeight: number, glyph: number, ratio: number): number {
  return Math.floor(Math.ceil(glyph * ratio) * lineHeight);
}

suite('Terminal line height', () => {
  test('makes a row as many device pixels tall as a line of the diff, at every display scale, as xterm.js rounds its rows to them', () => {
    for (const ratio of [1, 1.25, 1.5, 1.75, 2, 3]) {
      for (const [row, glyph] of [
        [17, 15.84],
        [17, 14.0625],
        [20, 16.5],
        [14, 13.97],
      ]) {
        assert.strictEqual(
          xtermRow(lineHeightFor(row, glyph, ratio), glyph, ratio),
          Math.round(row * ratio),
          `${row}px rows of ${glyph}px glyphs at ${ratio}`,
        );
      }
    }
  });

  test('keeps the line height at 1 for lines shorter than the glyphs, the least xterm.js takes', () => {
    assert.strictEqual(lineHeightFor(12, 15.84, 1), 1);
  });
});

function webglCell(advance: number, glyph: number, ratio: number): number {
  return Math.floor(glyph * ratio) + letterSpacingFor(advance, glyph, ratio);
}

suite('Terminal letter spacing', () => {
  test('makes a WebGL cell as wide as a character of the diff, which the page spaces a whole number of device pixels apart, as WebGL rounds glyphs down to whole device pixels', () => {
    for (const ratio of [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3]) {
      for (const [width, glyph] of [
        [7.2, 7.199999809265137],
        [7.2, 7.2],
        [6.6, 6.599999904632568],
        [7.8, 7.800000190734863],
      ]) {
        const advance = Math.round(width * ratio) / ratio;
        assert.strictEqual(
          webglCell(advance, glyph, ratio),
          Math.round(width * ratio),
          `${width}px characters at ${ratio}`,
        );
      }
    }
  });
});
