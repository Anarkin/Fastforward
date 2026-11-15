import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  knownBreaks,
  rememberBreaks,
} from '../../../../../tools/git/page/rowBreaks';

const wideColumnsIn = (row: string) => (index: number) =>
  row.slice(0, index).length + row.slice(0, index).split('界').length - 1;

const narrowColumnsIn = (row: string) => (index: number) =>
  Math.min(index, row.length);

const otherFontColumnsIn = (row: string) => (index: number) =>
  Math.min(index, row.length);

suite('Diff row heights', () => {
  test('knows a line that fits in the columns it wraps at has no breaks without laying it out, as laying out every line scrolled into view made dragging the scrollbar slow', () => {
    assert.deepStrictEqual(knownBreaks('fits', 8, 22, wideColumnsIn), []);
    assert.strictEqual(
      knownBreaks('it may wrap', 8, 22, wideColumnsIn),
      undefined,
    );
    assert.strictEqual(
      knownBreaks('界界界界', 8, 22, wideColumnsIn),
      undefined,
    );
    assert.strictEqual(knownBreaks('fits', 8, 22, undefined), undefined);
  });

  test('lays out a line that may wrap only once for its text, the columns it wraps at, its line height and font, so a line scrolled back into view is not laid out again', () => {
    const columnsIn = narrowColumnsIn;
    const otherFont = otherFontColumnsIn;
    const text = 'a line long enough to wrap, remembered';
    const breaks = [{ end: 9, blanks: [] }];

    rememberBreaks(text, 10, 22, columnsIn, breaks);

    assert.strictEqual(knownBreaks(text, 10, 22, columnsIn), breaks);
    assert.strictEqual(knownBreaks(text, 11, 22, columnsIn), undefined);
    assert.strictEqual(knownBreaks(text, 10, 23, columnsIn), undefined);
    assert.strictEqual(knownBreaks(text, 10, 22, otherFont), undefined);
  });
});
