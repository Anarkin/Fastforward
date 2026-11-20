import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { plainSearch } from '../../../../lib/shared/searchOptions';
import {
  matchCount,
  matchesIn as matchesWith,
  soughtCopy,
  stepMatch,
  validSearch,
} from '../../../../lib/shared/textMatches';

const matchesIn = (text: string, query: string) =>
  matchesWith(text, query, plainSearch);

const caseSensitive = { ...plainSearch, caseSensitive: true };

const found = (current: number, matches: number) => ({ current, matches });
const wholeWord = { ...plainSearch, wholeWord: true };
const regex = { ...plainSearch, regex: true };

suite('Find in diff', () => {
  test('takes a text selected for its occurrences to be marked only while it is on one line, not of whitespace alone and of 200 characters at most', () => {
    assert.strictEqual(soughtCopy('total'), 'total');
    assert.strictEqual(soughtCopy('a b'), 'a b');
    assert.strictEqual(soughtCopy('x'.repeat(200)), 'x'.repeat(200));
    for (const selected of ['', '  ', 'one\ntwo', 'x'.repeat(201)]) {
      assert.strictEqual(
        soughtCopy(selected),
        undefined,
        JSON.stringify(selected),
      );
    }
  });

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

  test('says which match is shown of how many, that there are none, that it is still searching, or that the pattern is not valid, and nothing while nothing is asked', () => {
    assert.strictEqual(matchCount('', plainSearch, found(0, 0)), '');
    assert.strictEqual(matchCount('x', plainSearch, found(0, 0)), 'No matches');
    assert.strictEqual(
      matchCount('x', plainSearch, { ...found(0, 0), searching: true }),
      'Searching…',
    );
    assert.strictEqual(matchCount('x', plainSearch, found(2, 17)), '3 of 17');
    assert.strictEqual(matchCount('x', plainSearch, found(-1, 17)), '0 of 17');
    assert.strictEqual(
      matchCount('x', plainSearch, { ...found(0, 4), capped: true }),
      '1 of 4+',
    );
    assert.strictEqual(
      matchCount('x', plainSearch, found(0, 10_000)),
      '1 of 10000+',
    );
    assert.strictEqual(
      matchCount('(', regex, found(0, 0)),
      'Not a valid pattern',
    );
    assert.strictEqual(matchCount('(', plainSearch, found(0, 0)), 'No matches');
  });

  test('steps to the next or previous match, wrapping around', () => {
    assert.strictEqual(stepMatch(0, 3, 1), 1);
    assert.strictEqual(stepMatch(2, 3, 1), 0);
    assert.strictEqual(stepMatch(0, 3, -1), 2);
    assert.strictEqual(stepMatch(0, 0, 1), 0);
  });
});

suite('Find with options', () => {
  test('matches the case of the query when asked, still finding a letter however either side composes it', () => {
    assert.deepStrictEqual(
      matchesWith('Find find FIND', 'find', caseSensitive),
      [{ start: 5, end: 9 }],
    );
    assert.deepStrictEqual(matchesWith('café.txt', 'café', caseSensitive), [
      { start: 0, end: 5 },
    ]);
    assert.deepStrictEqual(matchesWith('x CAFÉ', 'CAFÉ', caseSensitive), [
      { start: 2, end: 6 },
    ]);
    assert.deepStrictEqual(matchesWith('CAFÉ', 'café', caseSensitive), []);
    assert.deepStrictEqual(matchesWith('ΟΔΟΣ', 'ΟΔΟΣ', caseSensitive), [
      { start: 0, end: 4 },
    ]);
    assert.deepStrictEqual(matchesWith('οδος', 'οδοσ', caseSensitive), []);
  });

  test('finds whole words only when asked, with no letter, mark, digit or underscore of any script just before or after them', () => {
    assert.deepStrictEqual(
      matchesWith(
        'find finder refind find2 _find (find) find',
        'find',
        wholeWord,
      ),
      [
        { start: 0, end: 4 },
        { start: 32, end: 36 },
        { start: 38, end: 42 },
      ],
    );
    assert.deepStrictEqual(matchesWith('éfind find', 'find', wholeWord), [
      { start: 6, end: 10 },
    ]);
    assert.deepStrictEqual(matchesWith('mañana', 'man', wholeWord), []);
    assert.deepStrictEqual(matchesWith('mañana', 'man', wholeWord), []);
    assert.deepStrictEqual(matchesWith('aaa aa', 'aa', wholeWord), [
      { start: 4, end: 6 },
    ]);
    assert.deepStrictEqual(matchesWith('a-b a', 'a', wholeWord), [
      { start: 0, end: 1 },
      { start: 4, end: 5 },
    ]);
    assert.deepStrictEqual(
      matchesWith('Find FIND', 'find', { ...wholeWord, caseSensitive: true }),
      [],
    );
  });

  test('finds what a regular expression matches, ignoring case unless asked, in whole words when asked, skipping empty matches', () => {
    assert.deepStrictEqual(matchesWith('a1 b22 c333', String.raw`\d+`, regex), [
      { start: 1, end: 2 },
      { start: 4, end: 6 },
      { start: 8, end: 11 },
    ]);
    assert.deepStrictEqual(matchesWith('ABC', 'b', regex), [
      { start: 1, end: 2 },
    ]);
    assert.deepStrictEqual(
      matchesWith('ABC', 'b', { ...regex, caseSensitive: true }),
      [],
    );
    assert.deepStrictEqual(
      matchesWith('cat concat cats cat', 'cat|dog', {
        ...regex,
        wholeWord: true,
      }),
      [
        { start: 0, end: 3 },
        { start: 16, end: 19 },
      ],
    );
    assert.deepStrictEqual(matchesWith('baaa', 'a*', regex), [
      { start: 1, end: 4 },
    ]);
    assert.deepStrictEqual(matchesWith('a.b', '.', plainSearch), [
      { start: 1, end: 2 },
    ]);
    assert.deepStrictEqual(matchesWith('one\ntwo', '^t', regex), [
      { start: 4, end: 5 },
    ]);
  });

  test('finds nothing for a regular expression that is not valid, and says so', () => {
    assert.deepStrictEqual(matchesWith('(a)', '(', regex), []);
    assert.strictEqual(validSearch('(', regex), false);
    assert.strictEqual(validSearch('(', plainSearch), true);
    assert.strictEqual(validSearch('', regex), true);
    assert.strictEqual(validSearch('(a)', regex), true);
  });

  test('stops at the limit asked, whatever the options', () => {
    for (const options of [plainSearch, caseSensitive, wholeWord, regex]) {
      assert.strictEqual(
        matchesWith('a a a a', 'a', options, 2).length,
        2,
        JSON.stringify(options),
      );
    }
  });
});
