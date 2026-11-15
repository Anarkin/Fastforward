import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  filterRanges,
  filterWords,
  matchesFilter,
} from '../../../../lib/page/fileFilter';

suite('File filter', () => {
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
});
