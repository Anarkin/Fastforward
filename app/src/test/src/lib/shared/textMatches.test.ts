import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  matchCount,
  matchesIn,
  stepMatch,
} from '../../../../lib/shared/textMatches';

suite('Find in diff', () => {
  test('finds a match where it is, also after letters that lowercase longer', () => {
    assert.deepStrictEqual(matchesIn('İstanbul foo', 'foo'), [
      { start: 9, end: 12 },
    ]);
    assert.deepStrictEqual(matchesIn('İİ x İ', 'i̇'), [
      { start: 0, end: 1 },
      { start: 1, end: 2 },
      { start: 5, end: 6 },
    ]);
    assert.deepStrictEqual(matchesIn('İ', 'i'), [{ start: 0, end: 1 }]);
  });

  test('finds a letter with its accent however either side composes it, as macOS keeps names decomposed, and the letter alone in it however the text composes it', () => {
    const decomposed = 'café.txt';
    assert.deepStrictEqual(matchesIn(decomposed, 'café'), [
      { start: 0, end: 5 },
    ]);
    assert.deepStrictEqual(matchesIn('CAFÉ.txt', 'café'), [
      { start: 0, end: 4 },
    ]);
    assert.deepStrictEqual(matchesIn(`x ${decomposed}`, 'txt'), [
      { start: 8, end: 11 },
    ]);
    assert.deepStrictEqual(matchesIn('café', 'cafe'), [{ start: 0, end: 4 }]);
    assert.deepStrictEqual(matchesIn(decomposed, 'cafe'), [
      { start: 0, end: 4 },
    ]);
  });

  test('finds a capital sigma by its lowercase, also at the end of a word', () => {
    assert.deepStrictEqual(matchesIn('ΟΔΟΣ ΟΔΟΣ', 'σ'), [
      { start: 3, end: 4 },
      { start: 8, end: 9 },
    ]);
    assert.deepStrictEqual(matchesIn('ΟΔΟΣ x', 'Σ x'), [{ start: 3, end: 6 }]);
  });

  test('finds a word ending in a sigma however either side spells the sigma', () => {
    assert.deepStrictEqual(matchesIn('ΟΔΟΣ', 'ΟΔΟΣ'), [{ start: 0, end: 4 }]);
    assert.deepStrictEqual(matchesIn('ΟΔΟΣ x', 'οδος'), [{ start: 0, end: 4 }]);
    assert.deepStrictEqual(matchesIn('οδος', 'ΟΔΟΣ'), [{ start: 0, end: 4 }]);
    assert.deepStrictEqual(matchesIn('οδος', 'σ'), [{ start: 3, end: 4 }]);
  });

  test('finds every occurrence in a line, ignoring case, inside words too', () => {
    assert.deepStrictEqual(matchesIn('Find finder', 'find'), [
      { start: 0, end: 4 },
      { start: 5, end: 9 },
    ]);
    assert.deepStrictEqual(matchesIn('aaaa', 'aa'), [
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
    assert.deepStrictEqual(matchesIn('find', ''), []);
  });

  test('says which match is shown of how many, or that there are none', () => {
    assert.strictEqual(matchCount('', 0, 0), '');
    assert.strictEqual(matchCount('x', 0, 0), 'No results');
    assert.strictEqual(matchCount('x', 17, 2), '3 of 17');
  });

  test('steps to the next or previous match, wrapping around', () => {
    assert.strictEqual(stepMatch(0, 3, 1), 1);
    assert.strictEqual(stepMatch(2, 3, 1), 0);
    assert.strictEqual(stepMatch(0, 3, -1), 2);
    assert.strictEqual(stepMatch(0, 0, 1), 0);
  });
});
