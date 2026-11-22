import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  letterColumns,
  letterRows,
  letterRuns,
} from '../../../../shell/page/controlFontLetters';

suite('Letters of the control pictures', () => {
  test('draws a letter as runs of dots in five rows of three, the fewest that tell the letters of the names apart', () => {
    assert.deepStrictEqual(letterRuns('E'), [
      { row: 0, from: 0, to: 3 },
      { row: 1, from: 0, to: 1 },
      { row: 2, from: 0, to: 2 },
      { row: 3, from: 0, to: 1 },
      { row: 4, from: 0, to: 3 },
    ]);
    assert.deepStrictEqual(letterRuns('H')[0], { row: 0, from: 0, to: 1 });
    assert.deepStrictEqual(letterRuns('H')[1], { row: 0, from: 2, to: 3 });
  });

  test('keeps every letter inside its three columns and five rows, each drawn apart from every other', () => {
    const letters = 'ABCDEFGHIKLMNOPQRSTUVX1234'.split('');
    const drawn = letters.map((letter) => JSON.stringify(letterRuns(letter)));
    assert.strictEqual(new Set(drawn).size, letters.length);
    for (const letter of letters) {
      for (const { row, from, to } of letterRuns(letter)) {
        assert.ok(row >= 0 && row < letterRows, letter);
        assert.ok(from >= 0 && from < to && to <= letterColumns, letter);
      }
    }
  });

  test('says which letter it has no drawing of', () => {
    assert.throws(() => letterRuns('Z'), /No drawing of the letter Z/);
  });
});
