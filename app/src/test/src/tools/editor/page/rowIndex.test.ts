import * as assert from 'node:assert';
import { Text } from '@codemirror/state';
import { suite, test } from 'vitest';
import {
  RowIndex,
  WidestLine,
  rowsOfLine,
} from '../../../../../tools/editor/page/rowIndex';
import { wrappedLines } from '../../../../../lib/page/wordWrap';
import { columnsOf } from '../../../../../components/cells/page/columns';

const measure = { columns: 40, widths: undefined };

const lineOf = (at: number) =>
  at % 7 === 0
    ? `| cell ${at}${' '.repeat(at % 90)}| next ${'word '.repeat(at % 23)}|`
    : at % 5 === 0
      ? `\tindented ${'x'.repeat(at % 130)}`
      : `line ${at}`;

const doc = Text.of(Array.from({ length: 3000 }, (_, at) => lineOf(at)));

const rowsOf = (text: Text, number: number) =>
  wrappedLines(text.line(number).text, measure.columns);

function tops(text: Text): number[] {
  const above = [0];
  for (let number = 1; number <= text.lines; number++) {
    above.push((above.at(-1) ?? 0) + rowsOf(text, number));
  }
  return above;
}

function widestOf(text: Text): number {
  let most = 0;
  for (let number = 1; number <= text.lines; number++) {
    most = Math.max(most, columnsOf(text.line(number).text));
  }
  return most;
}

suite('The rows of the text edited', () => {
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

  test('knows how many rows stand above a line, how many rows the line is and how many the whole text has, as many as counting line by line gives', () => {
    const index = new RowIndex(measure);
    const above = tops(doc);

    assert.strictEqual(index.rows(doc), above.at(-1));
    for (const number of [1, 2, 17, 33, 1500, 1501, 2999, 3000]) {
      assert.deepStrictEqual(
        [index.above(doc, number), index.of(doc, number)],
        [above[number - 1], rowsOf(doc, number)],
        `line ${number}`,
      );
    }
    assert.strictEqual(index.above(doc, 0), 0);
    assert.strictEqual(index.above(doc, 3001), above.at(-1));
  });

  test('finds the line a row is of and which of its rows it is, the first row of the text for one above it and the last for one below', () => {
    const index = new RowIndex(measure);
    const above = tops(doc);
    const last = (above.at(-1) ?? 0) - 1;

    for (const number of [1, 8, 36, 1471, 2996, 3000]) {
      const top = above[number - 1] ?? 0;
      const rows = rowsOf(doc, number);
      assert.deepStrictEqual(
        [index.at(doc, top), index.at(doc, top + rows - 1)],
        [
          { line: number, row: 0 },
          { line: number, row: rows - 1 },
        ],
        `line ${number} of ${rows} rows`,
      );
    }
    assert.deepStrictEqual(index.at(doc, -5), { line: 1, row: 0 });
    assert.deepStrictEqual(index.at(doc, last + 9), index.at(doc, last));
    assert.strictEqual(index.at(doc, last).line, 3000);
  });

  test('counts a text changed since from the parts it shares with the text counted before', () => {
    const index = new RowIndex(measure);
    assert.strictEqual(index.rows(doc), tops(doc).at(-1));
    const changed = doc.replace(
      doc.line(1200).from,
      doc.line(1210).to,
      Text.of([`changed ${'z'.repeat(200)}`, 'and short']),
    );
    const above = tops(changed);

    assert.strictEqual(index.rows(changed), above.at(-1));
    assert.strictEqual(index.above(changed, 1300), above[1299]);
    assert.strictEqual(index.of(changed, 1200), rowsOf(changed, 1200));
    assert.deepStrictEqual(index.at(changed, above[1299] ?? 0), {
      line: 1300,
      row: 0,
    });
  });

  test('takes a line for a row where lines are not wrapped', () => {
    const index = new RowIndex(undefined);

    assert.deepStrictEqual(
      [
        index.rows(doc),
        index.above(doc, 1),
        index.above(doc, 2000),
        index.of(doc, 2000),
        index.at(doc, 0),
        index.at(doc, 1999),
        index.at(doc, 5000),
      ],
      [
        3000,
        0,
        1999,
        1,
        { line: 1, row: 0 },
        { line: 2000, row: 0 },
        { line: 3000, row: 0 },
      ],
    );
  });

  test('knows the widest line of a text in columns, a tab counted to its stop, and of a text changed since', () => {
    const widest = new WidestLine(undefined);

    assert.strictEqual(widest.columns(doc), widestOf(doc));
    const changed = doc.replace(
      doc.line(2000).from,
      doc.line(2000).to,
      Text.of([`\t${'w'.repeat(500)}`]),
    );
    assert.strictEqual(widest.columns(changed), widestOf(changed));
    assert.strictEqual(widest.columns(changed), 504);
    assert.strictEqual(widest.columns(Text.of([''])), 0);
  });
});
