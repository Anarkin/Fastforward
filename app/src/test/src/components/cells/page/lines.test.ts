import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  wrappedRows,
  type TextLine,
} from '../../../../../components/cells/page/lines';
import { wrappedLines } from '../../../../../lib/page/wordWrap';

const lineOf = (text: string): TextLine => ({ start: 7, end: 8, text });

suite('Rows a line wraps onto', () => {
  test('breaks a line into as many rows as the app counts for its height, each starting where the one before ends, the rows after the first hanging as far in as its indentation and each but the last marked where it breaks', () => {
    const line = lineOf(`  ${'word '.repeat(12)}end`);

    const rows = wrappedRows(line, 20, undefined);

    assert.strictEqual(rows.length, wrappedLines(line.text, 20));
    assert.ok(rows.length > 2);
    assert.deepStrictEqual(
      rows.map(({ from }) => from),
      [0, ...rows.slice(0, -1).map(({ to }) => to)],
    );
    assert.strictEqual(rows.at(-1)?.to, line.text.length);
    assert.deepStrictEqual(
      rows.map(({ indent }) => indent),
      [0, ...rows.slice(1).map(() => 2)],
    );
    assert.deepStrictEqual(
      rows.map(({ breakAt }) => breakAt !== undefined),
      [...rows.slice(1).map(() => true), false],
    );
    assert.ok(rows.every((row) => row.row === line && row.start === 7));
  });

  test('keeps a line that fits, and every line while nothing wraps, as one row of its whole text, and works a line out once for the columns it was asked for', () => {
    const short = lineOf('fits');
    const long = lineOf('word '.repeat(30));

    assert.deepStrictEqual(
      [
        wrappedRows(short, 20, undefined),
        wrappedRows(long, undefined, undefined),
      ].map((rows) => rows.map(({ from, to, breakAt }) => [from, to, breakAt])),
      [[[0, 4, undefined]], [[0, long.text.length, undefined]]],
    );
    assert.strictEqual(
      wrappedRows(long, 20, undefined),
      wrappedRows(long, 20, undefined),
    );
    assert.notStrictEqual(
      wrappedRows(long, 20, undefined),
      wrappedRows(long, 30, undefined),
    );
  });
});
