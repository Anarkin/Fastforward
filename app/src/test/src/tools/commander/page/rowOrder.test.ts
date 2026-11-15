import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { nextSort } from '../../../../../tools/commander/page/rowOrder';
import type { Sort } from '../../../../../tools/commander/shared/sorts';
import { defaultSort } from './listingFixtures';

suite('Commander row order', () => {
  test('keeps grouping by color when it sorts by another column or reverses it', () => {
    const sort: Sort = {
      column: 'extension',
      descending: false,
      groupByColor: true,
    };
    assert.deepStrictEqual(nextSort(sort, 'name'), {
      column: 'name',
      descending: false,
      groupByColor: true,
    });
    assert.deepStrictEqual(nextSort(sort, 'extension'), {
      column: 'extension',
      descending: true,
      groupByColor: true,
    });
  });

  test('sorts by another column ascending, and by the same one again the other way', () => {
    assert.deepStrictEqual(nextSort(defaultSort, 'name'), {
      column: 'name',
      descending: false,
      groupByColor: false,
    });
    assert.deepStrictEqual(nextSort(defaultSort, 'extension'), {
      column: 'extension',
      descending: true,
      groupByColor: false,
    });
  });
});
