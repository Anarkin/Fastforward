import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { parsePatch } from '../../../../../tools/git/page/diff';
import { patch, kinds } from './diffViewFixtures';
import { diffRows, type DiffRow } from '../../../../../tools/git/page/diffRows';
import { rowHeight } from '../../../../../tools/git/page/rowMeasures';
import {
  scrollOnToggle,
  stuckHeader,
} from '../../../../../tools/git/page/diffStuckHeader';

function laidOut(rows: readonly DiffRow[]) {
  let start = 0;
  return rows.map((row, index) => {
    const item = { index, start, end: start + (rowHeight(row) ?? 100) };
    start = item.end;
    return item;
  });
}

suite('Stuck file header', () => {
  const files = parsePatch(`${patch('a.ts', 3)}\n${patch('b.ts', 3)}`);
  const rows = diffRows(files, new Map(), undefined);
  const items = laidOut(rows);
  const start = (index: number) => items[index].start;

  test('sticks the header of the file whose line is on top', () => {
    assert.deepStrictEqual(kinds(rows), [
      'error',
      'file',
      'line',
      'line',
      'line',
      'file',
      'line',
      'line',
      'line',
    ]);
    assert.strictEqual(stuckHeader(rows, items, start(7) + 1), rows[5]);
    assert.strictEqual(stuckHeader(rows, items, start(5) + 1), rows[5]);
  });

  test('sticks nothing while a header is whole in its place, or no file is on top', () => {
    assert.strictEqual(stuckHeader(rows, items, start(5)), undefined);
    assert.strictEqual(stuckHeader(rows, items, 0), undefined);
    assert.strictEqual(stuckHeader(rows, items, start(1)), undefined);
  });

  test('sticks the header of a whole file too', () => {
    const whole = diffRows([], new Map(), {
      path: 'README.md',
      content: 'a\nb\nc\n',
      binary: false,
    });
    const wholeItems = laidOut(whole);
    assert.strictEqual(
      stuckHeader(whole, wholeItems, wholeItems[3].start),
      whole[1],
    );
  });

  test('scrolls to the header of a file closed from its stuck header, and nowhere otherwise', () => {
    const closed = diffRows(files, new Map([['b.ts', false]]), undefined);
    const closedHeader = closed[5];
    const openHeader = rows[5];
    assert.ok(closedHeader.kind === 'file' && openHeader.kind === 'file');
    assert.strictEqual(scrollOnToggle(closed, closedHeader, true), 5);
    assert.strictEqual(scrollOnToggle(rows, openHeader, false), undefined);
  });
});
