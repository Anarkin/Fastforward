import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { parsePatch } from '../../../../../components/diff/page/diff';
import {
  paneLine,
  paneOf,
} from '../../../../../components/diff/page/paneLines';
import { diffRows, lineKeys } from '../../../../../components/diff/page/rows';

const patch = [
  'diff --git a/a.ts b/a.ts',
  'index 1111111..2222222 100644',
  '--- a/a.ts',
  '+++ b/a.ts',
  '@@ -1,3 +1,3 @@',
  ' kept',
  '-old',
  '+new',
  '+more',
  ' last',
].join('\n');

const rowsOf = (sideBySide: boolean) => {
  const rows = diffRows(
    parsePatch(patch),
    new Map(),
    undefined,
    false,
    sideBySide,
  );
  return { rows, keys: lineKeys(rows) };
};

const told = (
  { rows, keys }: ReturnType<typeof rowsOf>,
  pane: number,
): unknown[] =>
  rows.flatMap((_, index) => {
    const lined = paneLine(rows, keys, pane, index);
    return lined === undefined
      ? []
      : [[lined.line.text, lined.change, lined.numbers, lined.key]];
  });

suite('Lines of a side of a diff', () => {
  test('gives an inline diff one side, each line with its text, its change, its old and its new number and its key, the rows that are no code none', () => {
    const inline = rowsOf(false);

    assert.deepStrictEqual(told(inline, 0), [
      ['kept', undefined, [1, 1], '0:0'],
      ['old', 'removed', [2, undefined], '0:1'],
      ['new', 'added', [undefined, 2], '0:2'],
      ['more', 'added', [undefined, 3], '0:3'],
      ['last', undefined, [3, 4], '0:4'],
    ]);
    assert.deepStrictEqual(told(inline, 1), []);
  });

  test('gives a diff side by side the old lines on the first side and the new on the second, each with the one number of its side, a side that has no line of a row none, and tints only what its side removed or added', () => {
    const split = rowsOf(true);

    assert.deepStrictEqual(told(split, 0), [
      ['kept', undefined, [1], '0:0'],
      ['old', 'removed', [2], '0:1'],
      ['last', undefined, [3], '0:4'],
    ]);
    assert.deepStrictEqual(told(split, 1), [
      ['kept', undefined, [1], '0:0'],
      ['new', 'added', [2], '0:2'],
      ['more', 'added', [3], '0:3'],
      ['last', undefined, [4], '0:4'],
    ]);
  });

  test('keeps the line of a row once made, numbered by its row so the lines of a side stand in their order, and finds a line again from its text row, as the cells are handed only that', () => {
    const { rows, keys } = rowsOf(true);
    const code = rows.findIndex((row) => row.kind === 'split');
    const first = paneLine(rows, keys, 1, code);
    const second = paneLine(rows, keys, 1, code + 1);

    assert.ok(first && second);
    assert.strictEqual(paneLine(rows, keys, 1, code), first);
    assert.deepStrictEqual(
      [first.line.start, first.line.end, second.line.start],
      [code, code + 1, code + 1],
    );
    assert.strictEqual(paneOf(second.line), second);
  });
});
