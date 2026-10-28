import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import {
  filterRanges,
  filterWords,
  matchesFilter,
} from '../../../../tools/git/page/fileFilter';
import { HighlightWords } from '../../../../tools/git/page/highlight';
import { filteredDiffFiles } from '../../../../tools/git/page/diffColumn';
import type { DiffFile } from '../../../../tools/git/page/diff';

const diffFile = (path: string, oldPath?: string): DiffFile => ({
  path,
  ...(oldPath === undefined ? {} : { oldPath }),
  binary: false,
  hunks: [],
});

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

  test('marks what the words found in a name in the search colors, leaving the rest as it is', () => {
    assert.strictEqual(
      renderToStaticMarkup(
        <HighlightWords text="DealsView.tsx" words={['view', 'TS']} />,
      ),
      'Deals<mark class="match">View</mark>.<mark class="match">ts</mark>x',
    );
    assert.strictEqual(
      renderToStaticMarkup(<HighlightWords text="a.ts" words={[]} />),
      'a.ts',
    );
  });

  test('shows the diffs of only the files the search finds while no file is selected, and the one selected whatever it is', () => {
    const files = [
      diffFile('a/view.ts'),
      diffFile('b/api.ts', 'b/view.ts'),
      diffFile('c.ts'),
    ];
    const paths = (path: string | undefined, filter: string | undefined) =>
      filteredDiffFiles(files, path, filter).map((shown) => shown.path);
    assert.deepStrictEqual(paths(undefined, 'view'), ['a/view.ts', 'b/api.ts']);
    assert.deepStrictEqual(paths(undefined, undefined), [
      'a/view.ts',
      'b/api.ts',
      'c.ts',
    ]);
    assert.deepStrictEqual(paths(undefined, ' '), [
      'a/view.ts',
      'b/api.ts',
      'c.ts',
    ]);
    assert.deepStrictEqual(paths('c.ts', 'view'), [
      'a/view.ts',
      'b/api.ts',
      'c.ts',
    ]);
  });
});
