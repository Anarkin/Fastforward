import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  filterNeedles,
  filterRanges,
  filterWords,
  foldedForFilter,
  matchesFilter,
  matchesNeedles,
} from '../../../../lib/shared/filter';

suite('Filter', () => {
  test('splits a query into its words, ignoring the spaces around and between them', () => {
    assert.deepStrictEqual(filterWords('  deals   Test.tsx '), [
      'deals',
      'Test.tsx',
    ]);
    assert.deepStrictEqual(filterWords('   '), []);
  });

  test('keeps a file whose path or old path holds every word of the query, in any order and whatever their case', () => {
    const words = filterWords('test DEALS');
    assert.strictEqual(
      matchesFilter(words, 'src/deals/DealsView.test.tsx'),
      true,
    );
    assert.strictEqual(matchesFilter(words, 'src/deals/DealsView.tsx'), false);
    assert.strictEqual(
      matchesFilter(words, 'src/other/view.test.tsx', 'src/deals/view.tsx'),
      true,
    );
    assert.strictEqual(matchesFilter([], 'anything.ts'), true);
  });

  test('finds every place a word of the query is in a name, joining places that touch or overlap', () => {
    assert.deepStrictEqual(filterRanges('DealsView.deals.ts', ['deals']), [
      { start: 0, end: 5 },
      { start: 10, end: 15 },
    ]);
    assert.deepStrictEqual(filterRanges('abcdef', ['abc', 'cd', 'ef']), [
      { start: 0, end: 6 },
    ]);
    assert.deepStrictEqual(filterRanges('abc', []), []);
  });

  test('keeps what holds every word of the query in any of its texts, one word in one and another in another, as a commit in its message and author or a menu item in its label and keywords', () => {
    const words = filterWords('ada BODY');
    assert.strictEqual(matchesFilter(words, 'Ada Lovelace', 'Some body'), true);
    assert.strictEqual(matchesFilter(words, 'Ada Lovelace', undefined), false);
    assert.strictEqual(matchesFilter(words), false);
  });

  test('folds the text as the find does, so a final sigma and letters composed or not match and mark alike', () => {
    assert.strictEqual(matchesFilter(['οδοσ'], 'ΟΔΟΣ'), true);
    assert.deepStrictEqual(filterRanges('élan', ['ÉLAN']), [
      { start: 0, end: 5 },
    ]);
  });

  test('matches a text folded beforehand, as the refs of a large repository are kept, exactly as it matches the text itself', () => {
    const texts = ['feature/Cursor-Fix', 'ΟΔΟΣ', 'élan', 'main'];
    for (const query of ['fix cursor', 'οδοσ', 'ÉLAN', 'ma in', 'zz', '']) {
      const words = filterWords(query);
      for (const text of texts) {
        assert.strictEqual(
          matchesNeedles(filterNeedles(words), foldedForFilter(text)),
          matchesFilter(words, text),
          `${query} in ${text}`,
        );
      }
    }
  });
});
