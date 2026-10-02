import * as assert from 'node:assert';
import { wrapColumns, wrappedLines } from '../webview/wordWrap';

suite('Word wrap', () => {
  test('keeps a line that fits on one row', () => {
    assert.strictEqual(wrappedLines('', 10), 1);
    assert.strictEqual(wrappedLines('0123456789', 10), 1);
  });

  test('wraps before the word that does not fit, the spaces before it hanging at the end of the row', () => {
    assert.strictEqual(wrappedLines('one two three', 7), 2);
    assert.strictEqual(wrappedLines('one two three', 6), 3);
    assert.strictEqual(wrappedLines('one       ', 3), 1);
    assert.strictEqual(wrappedLines('        one', 4), 2);
  });

  test('breaks a word longer than a row anywhere, starting it on a row of its own', () => {
    assert.strictEqual(wrappedLines('abcdefghij', 4), 3);
    assert.strictEqual(wrappedLines('a abcdefgh', 4), 3);
  });

  test('wraps only at spaces and tabs, not at a non-breaking space', () => {
    assert.strictEqual(wrappedLines('one two', 4), 2);
    assert.strictEqual(wrappedLines('one\ttwo', 4), 2);
  });

  test('draws a tab to the next stop of four columns', () => {
    assert.strictEqual(wrappedLines('\tab', 6), 1);
    assert.strictEqual(wrappedLines('a\tbcd', 6), 2);
  });

  test('fits as many whole characters in a row as its width holds, and at least one', () => {
    assert.strictEqual(wrapColumns(100, 7.2), 13);
    assert.strictEqual(wrapColumns(72, 7.2), 10);
    assert.strictEqual(wrapColumns(3, 7.2), 1);
  });

  test('expects no line to wrap while the characters have no width, as in a hidden column', () => {
    assert.strictEqual(wrapColumns(0, 0), Infinity);
    assert.strictEqual(wrappedLines('one two', wrapColumns(0, 0)), 1);
  });
});
