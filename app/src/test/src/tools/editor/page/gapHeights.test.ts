import * as assert from 'node:assert';
import { Text } from '@codemirror/state';
import { suite, test } from 'vitest';
import {
  RowCounts,
  rowsOfLine,
} from '../../../../../tools/editor/page/gapHeights';
import { wrappedLines } from '../../../../../lib/page/wordWrap';

const measure = { columns: 40, widths: undefined };

const lineOf = (at: number) =>
  at % 7 === 0
    ? `| cell ${at}${' '.repeat(at % 90)}| next ${'word '.repeat(at % 23)}|`
    : at % 5 === 0
      ? `\tindented ${'x'.repeat(at % 130)}`
      : `line ${at}`;

const doc = Text.of(Array.from({ length: 3000 }, (_, at) => lineOf(at)));

const counted = (text: Text, first: number, last: number) => {
  let rows = 0;
  for (let number = first; number <= last; number++) {
    rows += wrappedLines(text.line(number).text, measure.columns);
  }
  return rows;
};

const between = (counts: RowCounts, text: Text, first: number, last: number) =>
  counts.between(text, text.line(first).from, text.line(last).to);

suite('The heights the editor gives the lines it has not drawn', () => {
  test('counts a line as many rows as the editor wraps it onto, one for a line too short to wrap', () => {
    for (let at = 0; at < 300; at++) {
      const line = lineOf(at);
      assert.strictEqual(
        rowsOfLine(line, measure),
        wrappedLines(line, measure.columns),
        JSON.stringify(line),
      );
    }
    assert.strictEqual(rowsOfLine('short', measure), 1);
  });

  test('counts the rows of the lines between two places, from the parts of the text it counted before, as many as counting line by line gives', () => {
    const counts = new RowCounts(measure);
    for (const [first, last] of [
      [1, 3000],
      [1, 1],
      [17, 2900],
      [1500, 1501],
      [2999, 3000],
      [1, 3000],
    ] as const) {
      assert.strictEqual(
        between(counts, doc, first, last),
        counted(doc, first, last),
        `${first} to ${last}`,
      );
    }
  });

  test('counts a text changed since, as the parts it shares with the text counted before keep their counts', () => {
    const counts = new RowCounts(measure);
    assert.strictEqual(between(counts, doc, 1, 3000), counted(doc, 1, 3000));
    const changed = doc.replace(
      doc.line(1200).from,
      doc.line(1210).to,
      Text.of([`changed ${'z'.repeat(200)}`, 'and short']),
    );
    const lines = changed.lines;
    assert.strictEqual(
      between(counts, changed, 1, lines),
      counted(changed, 1, lines),
    );
    assert.strictEqual(
      between(counts, changed, 1100, 1300),
      counted(changed, 1100, 1300),
    );
  });
});
