import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  filterNeedles,
  filterRanges,
  filterText,
  narrows,
  matchesFilter,
  matchesNeedles,
  searchFilter,
} from '../../../../lib/shared/filter';
import {
  plainSearch,
  type SearchOptions,
} from '../../../../lib/shared/searchOptions';
import { matchesIn } from '../../../../lib/shared/textMatches';

const plain = (query: string) => searchFilter(query, plainSearch);

const caseSensitive = { ...plainSearch, caseSensitive: true };
const wholeWord = { ...plainSearch, wholeWord: true };
const regex = { ...plainSearch, regex: true };

const both = [false, true];

const everyOptions: readonly SearchOptions[] = both.flatMap((matchCase) =>
  both.flatMap((whole) =>
    both.map((pattern) => ({
      caseSensitive: matchCase,
      wholeWord: whole,
      regex: pattern,
    })),
  ),
);

suite('Filter', () => {
  test('splits a query into its words, ignoring the spaces around and between them', () => {
    assert.deepStrictEqual(plain('  deals   Test.tsx ').words, [
      'deals',
      'Test.tsx',
    ]);
    assert.deepStrictEqual(plain('   ').words, []);
    assert.strictEqual(narrows(plain('   ')), false);
    assert.strictEqual(narrows(plain('a')), true);
  });

  test('keeps a file whose path or old path holds every word of the query, in any order and whatever their case', () => {
    const filter = plain('test DEALS');
    assert.strictEqual(
      matchesFilter(filter, 'src/deals/DealsView.test.tsx'),
      true,
    );
    assert.strictEqual(matchesFilter(filter, 'src/deals/DealsView.tsx'), false);
    assert.strictEqual(
      matchesFilter(filter, 'src/other/view.test.tsx', 'src/deals/view.tsx'),
      true,
    );
    assert.strictEqual(matchesFilter(plain(''), 'anything.ts'), true);
  });

  test('finds every place a word of the query is in a name, joining places that touch or overlap', () => {
    assert.deepStrictEqual(filterRanges('DealsView.deals.ts', plain('deals')), [
      { start: 0, end: 5 },
      { start: 10, end: 15 },
    ]);
    assert.deepStrictEqual(filterRanges('abcdef', plain('abc cd ef')), [
      { start: 0, end: 6 },
    ]);
    assert.deepStrictEqual(filterRanges('abc', plain('')), []);
  });

  test('keeps what holds every word of the query in any of its texts, one word in one and another in another, as a commit in its message and author or a menu item in its label and keywords', () => {
    const filter = plain('ada BODY');
    assert.strictEqual(
      matchesFilter(filter, 'Ada Lovelace', 'Some body'),
      true,
    );
    assert.strictEqual(matchesFilter(filter, 'Ada Lovelace', undefined), false);
    assert.strictEqual(matchesFilter(filter), false);
  });

  test('folds the text as the find does, so a final sigma and letters composed or not match and mark alike', () => {
    assert.strictEqual(matchesFilter(plain('οδοσ'), 'ΟΔΟΣ'), true);
    assert.deepStrictEqual(filterRanges('élan', plain('ÉLAN')), [
      { start: 0, end: 5 },
    ]);
  });

  test('matches a text folded beforehand, as the refs of a large repository are kept, exactly as it matches the text itself, whatever the options', () => {
    const texts = ['feature/Cursor-Fix', 'ΟΔΟΣ', 'élan', 'main', 'fix_it'];
    for (const options of everyOptions) {
      for (const query of [
        'fix cursor',
        'Fix',
        'οδοσ',
        'ÉLAN',
        'ma in',
        'zz',
        '',
        'fix|main',
        '(',
      ]) {
        const filter = searchFilter(query, options);
        for (const text of texts) {
          assert.strictEqual(
            matchesNeedles(filterNeedles(filter), filterText(text)),
            matchesFilter(filter, text),
            `${query} in ${text} with ${JSON.stringify(options)}`,
          );
        }
      }
    }
  });
});

suite('Filter with options', () => {
  test('matches the case of each word when asked', () => {
    const filter = searchFilter('Deals view', caseSensitive);
    assert.strictEqual(matchesFilter(filter, 'src/Deals/view.tsx'), true);
    assert.strictEqual(matchesFilter(filter, 'src/deals/View.tsx'), false);
    assert.deepStrictEqual(filterRanges('Deals deals', filter), [
      { start: 0, end: 5 },
    ]);
  });

  test('keeps each word whole when asked', () => {
    const filter = searchFilter('deal view', wholeWord);
    assert.strictEqual(matchesFilter(filter, 'src/deal/view.tsx'), true);
    assert.strictEqual(matchesFilter(filter, 'src/deals/view.tsx'), false);
    assert.deepStrictEqual(filterRanges('deal deals', filter), [
      { start: 0, end: 4 },
    ]);
  });

  test('takes the whole query as one pattern, spaces and all, which must match somewhere in any of the texts, marking what it matches', () => {
    assert.deepStrictEqual(searchFilter(' a b ', regex).words, [' a b ']);
    assert.deepStrictEqual(searchFilter('', regex).words, []);
    const filter = searchFilter(String.raw`\.test\.tsx?$`, regex);
    assert.strictEqual(matchesFilter(filter, 'view.test.ts'), true);
    assert.strictEqual(matchesFilter(filter, 'view.ts', 'view.test.tsx'), true);
    assert.strictEqual(matchesFilter(filter, 'view.test.ts.map'), false);
    assert.deepStrictEqual(filterRanges('view.test.ts', filter), [
      { start: 4, end: 12 },
    ]);
    assert.strictEqual(
      matchesFilter(searchFilter('deals view', regex), 'deals/view'),
      false,
    );
  });

  test('matches nothing for a pattern that is not valid', () => {
    const filter = searchFilter('(', regex);
    assert.strictEqual(narrows(filter), true);
    assert.strictEqual(matchesFilter(filter, '(', 'anything'), false);
    assert.deepStrictEqual(filterRanges('(', filter), []);
  });

  test('agrees with the find on what case and whole words mean, word by word', () => {
    const texts = [
      'Find finder',
      'refind FIND',
      'find_it',
      'ΟΔΟΣ οδος',
      'éfind',
    ];
    for (const options of everyOptions.filter((each) => !each.regex)) {
      for (const word of ['find', 'FIND', 'οδος', 'ΟΔΟΣ']) {
        for (const text of texts) {
          const found = matchesIn(text, word, options);
          const filter = searchFilter(word, options);
          assert.strictEqual(
            matchesFilter(filter, text),
            found.length > 0,
            `${word} in ${text} with ${JSON.stringify(options)}`,
          );
          assert.deepStrictEqual(filterRanges(text, filter), found);
        }
      }
    }
  });
});
